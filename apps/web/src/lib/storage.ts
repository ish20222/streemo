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

function storageMode(): "local" | "r2" {
  return process.env.STORAGE_MODE === "r2" ? "r2" : "local";
}

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  return process.env.R2_BUCKET || "streemo";
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
  const client = getR2Client();
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
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function getLocalObject(key: string) {
  return readFile(path.join(LOCAL_UPLOAD_DIR, key));
}

/** Signed URL for R2, or app URL for local storage (optional device token query). */
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
  const client = getR2Client();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: 60 * 60 * 6 }
  );
}
