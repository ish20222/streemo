import { NextRequest } from "next/server";
import { z } from "zod";
import { createDeviceToken } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { Device, toJSON } from "@/lib/models";
import { jsonError } from "@/lib/utils";

const schema = z.object({
  pairingCode: z.string().min(4).max(12),
  name: z.string().min(1).max(120).nullish(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid pairing request");

  await connectMongo();
  const code = parsed.data.pairingCode.toUpperCase().trim();
  const device = await Device.findOne({ pairingCode: code });
  if (!device) return jsonError("Invalid pairing code", 404);

  const token = await createDeviceToken(String(device._id));
  device.deviceToken = token;
  if (parsed.data.name) device.name = parsed.data.name;
  device.status = "online";
  device.lastSeenAt = new Date();
  await device.save();

  return Response.json({
    deviceId: String(device._id),
    deviceToken: token,
    name: device.name,
    serverUrl: process.env.APP_URL || null,
    device: toJSON(device),
  });
}
