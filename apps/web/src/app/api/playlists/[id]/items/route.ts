import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { deviceHub } from "@/lib/device-hub";
import { Device, MediaAsset, Playlist, toJSON } from "@/lib/models";
import { jsonError } from "@/lib/utils";
import { customAlphabet } from "nanoid";

const itemId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);

type Ctx = { params: Promise<{ id: string }> };

async function notifyDevicesUsingPlaylist(playlistId: string) {
  const devices = await Device.find({
    $or: [{ videoPlaylistId: playlistId }, { musicPlaylistId: playlistId }],
  }).select("_id");
  for (const d of devices) deviceHub.notifyQueueUpdated(String(d._id));
}

const addSchema = z.object({
  mediaId: z.string().min(1),
});

const reorderSchema = z.object({
  itemIds: z.array(z.string()),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await connectMongo();
  const playlist = await Playlist.findById(id);
  if (!playlist) return jsonError("Playlist not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return jsonError("mediaId required");

  const media = await MediaAsset.findById(parsed.data.mediaId);
  if (!media) return jsonError("Media not found", 404);

  if (playlist.kind === "video" && media.type !== "video") {
    return jsonError("Video playlists only accept video files");
  }
  if (playlist.kind === "music" && media.type !== "audio") {
    return jsonError("Music playlists only accept audio files");
  }

  const position =
    playlist.items.length === 0
      ? 0
      : Math.max(...playlist.items.map((i: any) => i.position)) + 1;

  const newItem = {
    _id: itemId(),
    mediaId: String(media._id),
    position,
    startAt: null,
    endAt: null,
    createdAt: new Date(),
  };
  playlist.items.push(newItem);
  await playlist.save();

  await notifyDevicesUsingPlaylist(id);
  return Response.json(
    {
      item: {
        id: newItem._id,
        mediaId: newItem.mediaId,
        position: newItem.position,
        media: toJSON(media),
      },
    },
    { status: 201 }
  );
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return jsonError("itemIds required");

  await connectMongo();
  const playlist = await Playlist.findById(id);
  if (!playlist) return jsonError("Not found", 404);

  const byId = new Map<string, any>(
    playlist.items.map((i: any) => [String(i._id), i])
  );
  playlist.items = parsed.data.itemIds
    .map((iid, index) => {
      const item = byId.get(iid);
      if (!item) return null;
      item.position = index;
      return item;
    })
    .filter(Boolean);
  await playlist.save();

  await notifyDevicesUsingPlaylist(id);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const itemIdParam = req.nextUrl.searchParams.get("itemId");
  if (!itemIdParam) return jsonError("itemId required");

  await connectMongo();
  const playlist = await Playlist.findById(id);
  if (!playlist) return jsonError("Not found", 404);

  playlist.items = playlist.items.filter(
    (i: any) => String(i._id) !== itemIdParam
  ) as any;
  playlist.items.forEach((item: any, index: number) => {
    item.position = index;
  });
  await playlist.save();

  await notifyDevicesUsingPlaylist(id);
  return Response.json({ ok: true });
}
