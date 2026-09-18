import { NextRequest } from "next/server";
import { getBearerToken, verifyDeviceToken } from "@/lib/auth";
import { buildDeviceManifest } from "@/lib/manifest";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const token = getBearerToken(req);
  if (!token) return jsonError("Unauthorized", 401);

  const deviceId = await verifyDeviceToken(token);
  if (!deviceId || deviceId !== id) return jsonError("Unauthorized", 401);

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device || device.deviceToken !== token) return jsonError("Unauthorized", 401);

  const manifest = await buildDeviceManifest(id);
  if (!manifest) return jsonError("Device not found", 404);

  await prisma.device.update({
    where: { id },
    data: { lastSeenAt: new Date(), status: "online" },
  });

  return Response.json(manifest);
}
