import { NextRequest } from "next/server";
import { getBearerToken, verifyDeviceToken } from "@/lib/auth";
import { buildDeviceManifest } from "@/lib/manifest";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

/** Convenience: device fetches its own manifest without knowing ID in path. */
export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return jsonError("Unauthorized", 401);
  const deviceId = await verifyDeviceToken(token);
  if (!deviceId) return jsonError("Unauthorized", 401);

  const device = await prisma.device.findUnique({ where: { id: deviceId } });
  if (!device || device.deviceToken !== token) return jsonError("Unauthorized", 401);

  const manifest = await buildDeviceManifest(deviceId);
  return Response.json(manifest);
}
