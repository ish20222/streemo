import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceHub } from "@/lib/device-hub";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const device = await prisma.device.findUnique({
    where: { id },
    include: {
      videoPlaylist: true,
      musicPlaylist: true,
      playbackState: true,
    },
  });
  if (!device) return jsonError("Device not found", 404);
  return Response.json({
    device: { ...device, liveOnline: deviceHub.isOnline(device.id) },
  });
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  location: z.string().max(200).nullable().optional(),
  videoEnabled: z.boolean().optional(),
  musicEnabled: z.boolean().optional(),
  audioSink: z.string().min(1).max(120).optional(),
  videoPlaylistId: z.string().nullable().optional(),
  musicPlaylistId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid update");

  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing) return jsonError("Device not found", 404);

  const device = await prisma.device.update({
    where: { id },
    data: parsed.data,
  });

  deviceHub.send(id, {
    type: "config",
    audioSink: device.audioSink,
    videoEnabled: device.videoEnabled,
    musicEnabled: device.musicEnabled,
  });
  deviceHub.notifyQueueUpdated(id);

  return Response.json({ device });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await prisma.device.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
