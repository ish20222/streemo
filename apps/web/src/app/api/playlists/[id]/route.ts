import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { deviceHub } from "@/lib/device-hub";
import { Device, MediaAsset, Playlist, toJSON } from "@/lib/models";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

async function enrichPlaylist(playlist: any) {
  const p = toJSON<any>(playlist);
  const mediaIds = (p.items || []).map((i: any) => i.mediaId);
  const mediaList = mediaIds.length
    ? await MediaAsset.find({ _id: { $in: mediaIds } }).lean()
    : [];
  const byId = new Map<string, any>(mediaList.map((m: any) => [String(m._id), m]));
  p.items = (p.items || [])
    .slice()
    .sort((a: any, b: any) => a.position - b.position)
    .map((item: any) => {
      const media: any = byId.get(String(item.mediaId));
      return {
        ...item,
        media: media
          ? {
              id: String(media._id),
              type: media.type,
              filename: media.filename,
              mimeType: media.mimeType,
              size: media.size,
            }
          : null,
      };
    });
  return p;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await connectMongo();
  const playlist = await Playlist.findById(id);
  if (!playlist) return jsonError("Not found", 404);
  return Response.json({ playlist: await enrichPlaylist(playlist) });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid update");

  await connectMongo();
  const playlist = await Playlist.findByIdAndUpdate(
    id,
    { $set: parsed.data },
    { new: true }
  );
  if (!playlist) return jsonError("Not found", 404);
  return Response.json({ playlist: toJSON(playlist) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await connectMongo();
  const devices = await Device.find({
    $or: [{ videoPlaylistId: id }, { musicPlaylistId: id }],
  }).select("_id");
  await Playlist.findByIdAndDelete(id);
  await Device.updateMany(
    { videoPlaylistId: id },
    { $set: { videoPlaylistId: null } }
  );
  await Device.updateMany(
    { musicPlaylistId: id },
    { $set: { musicPlaylistId: null } }
  );
  for (const d of devices) deviceHub.notifyQueueUpdated(String(d._id));
  return Response.json({ ok: true });
}
