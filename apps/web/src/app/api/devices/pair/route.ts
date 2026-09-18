import { NextRequest } from "next/server";
import { z } from "zod";
import { createDeviceToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

const schema = z.object({
  pairingCode: z.string().min(4).max(12),
  name: z.string().min(1).max(120).optional(),
});

/** Called by Pi agent to claim a pairing code and receive a device token. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid pairing request");

  const code = parsed.data.pairingCode.toUpperCase().trim();
  const device = await prisma.device.findUnique({ where: { pairingCode: code } });
  if (!device) return jsonError("Invalid pairing code", 404);

  const token = await createDeviceToken(device.id);
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: {
      deviceToken: token,
      name: parsed.data.name || device.name,
      status: "online",
      lastSeenAt: new Date(),
    },
  });

  return Response.json({
    deviceId: updated.id,
    deviceToken: token,
    name: updated.name,
    serverUrl: process.env.APP_URL || null,
  });
}
