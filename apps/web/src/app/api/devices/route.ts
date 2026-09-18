import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceHub } from "@/lib/device-hub";
import { generatePairingCode, jsonError } from "@/lib/utils";

export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }

  const devices = await prisma.device.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      videoPlaylist: { select: { id: true, name: true } },
      musicPlaylist: { select: { id: true, name: true } },
      playbackState: true,
    },
  });

  return Response.json({
    devices: devices.map((d) => ({
      ...d,
      liveOnline: deviceHub.isOnline(d.id),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  location: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid device data");

  let pairingCode = generatePairingCode();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.device.findUnique({ where: { pairingCode } });
    if (!exists) break;
    pairingCode = generatePairingCode();
  }

  const device = await prisma.device.create({
    data: {
      name: parsed.data.name,
      location: parsed.data.location,
      pairingCode,
    },
  });

  return Response.json({ device }, { status: 201 });
}
