import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import path from "path";

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "uploads");

function storageMode(): "local" | "s3" {
  const mode = (process.env.STORAGE_MODE || "local").toLowerCase();
  // Accept legacy "r2" as s3-compatible cloud storage
  if (mode === "s3" || mode === "r2") return "s3";
  return "local";
}

function getS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when STORAGE_MODE=s3");
  }
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  return process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || "streemo";
}

export function checksumBuffer(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (storageMode() === "local") {
    const full = path.join(LOCAL_UPLOAD_DIR, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return;
  }
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function deleteObject(key: string) {
  if (storageMode() === "local") {
    try {
      await unlink(path.join(LOCAL_UPLOAD_DIR, key));
    } catch {
      /* ignore missing */
    }
    return;
  }
  const client = getS3Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function getLocalObject(key: string) {
  return readFile(path.join(LOCAL_UPLOAD_DIR, key));
}

/** Signed S3 URL, or app URL for local storage (optional device token query). */
export async function getDownloadUrl(
  key: string,
  mediaId: string,
  deviceToken?: string | null
) {
  if (storageMode() === "local") {
    const base = process.env.APP_URL || "http://localhost:3000";
    const url = `${base}/api/media/${mediaId}/file`;
    if (deviceToken) {
      return `${url}?token=${encodeURIComponent(deviceToken)}`;
    }
    return url;
  }
  const client = getS3Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 60 * 60 * 6 }
  );
}
