import { NextRequest } from "next/server";
import { getBearerToken, verifyDeviceToken } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { buildDeviceManifest } from "@/lib/manifest";
import { Device } from "@/lib/models";
import { jsonError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError("Unauthorized", 401);
  const deviceId = await verifyDeviceToken(token);
  if (!deviceId) return jsonError("Unauthorized", 401);

  await connectMongo();
  const device = await Device.findById(deviceId);
  if (!device || device.deviceToken !== token) return jsonError("Unauthorized", 401);

  const manifest = await buildDeviceManifest(deviceId);
  return Response.json(manifest);
}
