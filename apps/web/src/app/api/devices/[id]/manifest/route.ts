import { NextRequest } from "next/server";
import { getBearerToken, verifyDeviceToken } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { buildDeviceManifest } from "@/lib/manifest";
import { Device } from "@/lib/models";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const token = getBearerToken(req);
  if (!token) return jsonError("Unauthorized", 401);

  const deviceId = await verifyDeviceToken(token);
  if (!deviceId || deviceId !== id) return jsonError("Unauthorized", 401);

  await connectMongo();
  const device = await Device.findById(id);
  if (!device || device.deviceToken !== token) return jsonError("Unauthorized", 401);

  const manifest = await buildDeviceManifest(id);
  if (!manifest) return jsonError("Device not found", 404);

  device.lastSeenAt = new Date();
  device.status = "online";
  await device.save();

  return Response.json(manifest);
}
