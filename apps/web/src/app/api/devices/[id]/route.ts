import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { Device, Playlist, toJSON } from "@/lib/models";
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
  await connectMongo();
  const device = await Device.findById(id);
  if (!device) return jsonError("Device not found", 404);

  const d = toJSON<any>(device);
  const [videoPlaylist, musicPlaylist] = await Promise.all([
    d.videoPlaylistId ? Playlist.findById(d.videoPlaylistId).lean() : null,
    d.musicPlaylistId ? Playlist.findById(d.musicPlaylistId).lean() : null,
  ]);

  return Response.json({
    device: {
      ...d,
      videoPlaylist: videoPlaylist ? toJSON(videoPlaylist) : null,
      musicPlaylist: musicPlaylist ? toJSON(musicPlaylist) : null,
      liveOnline: deviceHub.isOnline(d.id),
    },
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

  await connectMongo();
  const device = await Device.findByIdAndUpdate(id, { $set: parsed.data }, { new: true });
  if (!device) return jsonError("Device not found", 404);

  deviceHub.send(id, {
    type: "config",
    audioSink: device.audioSink,
    videoEnabled: device.videoEnabled,
    musicEnabled: device.musicEnabled,
  });
  deviceHub.notifyQueueUpdated(id);

  return Response.json({ device: toJSON(device) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await connectMongo();
  await Device.findByIdAndDelete(id);
  return Response.json({ ok: true });
}
