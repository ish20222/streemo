import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deviceHub } from "@/lib/device-hub";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

async function notifyDevicesUsingPlaylist(playlistId: string) {
  const devices = await prisma.device.findMany({
    where: {
      OR: [{ videoPlaylistId: playlistId }, { musicPlaylistId: playlistId }],
    },
    select: { id: true },
  });
  for (const d of devices) deviceHub.notifyQueueUpdated(d.id);
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
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) return jsonError("Playlist not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return jsonError("mediaId required");

  const media = await prisma.mediaAsset.findUnique({
    where: { id: parsed.data.mediaId },
  });
  if (!media) return jsonError("Media not found", 404);

  if (playlist.kind === "video" && media.type !== "video") {
    return jsonError("Video playlists only accept video files");
  }
  if (playlist.kind === "music" && media.type !== "audio") {
    return jsonError("Music playlists only accept audio files");
  }

  const max = await prisma.playlistItem.aggregate({
    where: { playlistId: id },
    _max: { position: true },
  });
  const position = (max._max.position ?? -1) + 1;

  const item = await prisma.playlistItem.create({
    data: { playlistId: id, mediaId: media.id, position },
    include: { media: true },
  });

  await notifyDevicesUsingPlaylist(id);
  return Response.json({ item }, { status: 201 });
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

  await prisma.$transaction(
    parsed.data.itemIds.map((itemId, index) =>
      prisma.playlistItem.updateMany({
        where: { id: itemId, playlistId: id },
        data: { position: index },
      })
    )
  );

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
  const itemId = req.nextUrl.searchParams.get("itemId");
  if (!itemId) return jsonError("itemId required");

  await prisma.playlistItem.deleteMany({
    where: { id: itemId, playlistId: id },
  });

  const remaining = await prisma.playlistItem.findMany({
    where: { playlistId: id },
    orderBy: { position: "asc" },
  });
  await prisma.$transaction(
    remaining.map((item, index) =>
      prisma.playlistItem.update({
        where: { id: item.id },
        data: { position: index },
      })
    )
  );

  await notifyDevicesUsingPlaylist(id);
  return Response.json({ ok: true });
}
