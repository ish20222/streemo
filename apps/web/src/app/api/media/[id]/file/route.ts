import { NextRequest } from "next/server";
import { getBearerToken, getSessionUser, verifyDeviceToken } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { Device, MediaAsset } from "@/lib/models";
import { getLocalObject } from "@/lib/storage";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await connectMongo();
  const media = await MediaAsset.findById(id);
  if (!media) return jsonError("Not found", 404);

  const user = await getSessionUser();
  const token = getBearerToken(req);
  let allowed = !!user;
  if (!allowed && token) {
    const deviceId = await verifyDeviceToken(token);
    if (deviceId) {
      const device = await Device.findById(deviceId);
      allowed = !!device && device.deviceToken === token;
    }
  }
  const qToken = req.nextUrl.searchParams.get("token");
  if (!allowed && qToken) {
    const deviceId = await verifyDeviceToken(qToken);
    if (deviceId) {
      const device = await Device.findById(deviceId);
      allowed = !!device && device.deviceToken === qToken;
    }
  }

  if (!allowed) return jsonError("Unauthorized", 401);

  if (process.env.STORAGE_MODE === "s3" || process.env.STORAGE_MODE === "r2") {
    return jsonError("Use signed download URL from manifest", 400);
  }

  try {
    const buf = await getLocalObject(media.storageKey);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return jsonError("File missing", 404);
  }
}
