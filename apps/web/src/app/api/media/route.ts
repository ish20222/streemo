import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checksumBuffer, putObject } from "@/lib/storage";
import { isAudioMime, isVideoMime, jsonError } from "@/lib/utils";
import { nanoid } from "nanoid";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const media = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ media });
}

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file is required");

  const mimeType = file.type || "application/octet-stream";
  let type: "video" | "audio";
  if (isVideoMime(mimeType)) type = "video";
  else if (isAudioMime(mimeType)) type = "audio";
  else return jsonError("Only video or audio files are allowed");

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0) return jsonError("Empty file");
  if (buf.length > 500 * 1024 * 1024) return jsonError("File too large (max 500MB)");

  const checksum = checksumBuffer(buf);
  const existing = await prisma.mediaAsset.findFirst({ where: { checksum } });
  if (existing) {
    return Response.json({ media: existing, deduped: true });
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : type === "video" ? "mp4" : "mp3";
  const storageKey = `${type}/${nanoid()}.${ext}`;
  await putObject(storageKey, buf, mimeType);

  const durationRaw = form.get("durationSec");
  const durationSec =
    typeof durationRaw === "string" && durationRaw !== ""
      ? Number(durationRaw)
      : null;

  const media = await prisma.mediaAsset.create({
    data: {
      type,
      filename: file.name,
      mimeType,
      size: buf.length,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      storageKey,
      checksum,
    },
  });

  return Response.json({ media }, { status: 201 });
}
