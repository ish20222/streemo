import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { Device, MediaAsset, Playlist, toJSON } from "@/lib/models";
import { jsonError } from "@/lib/utils";

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
              checksum: media.checksum,
              durationSec: media.durationSec ?? null,
            }
          : null,
      };
    });
  return p;
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const kind = req.nextUrl.searchParams.get("kind");
  await connectMongo();
  const query = kind ? { kind } : {};
  const playlists: any[] = await Playlist.find(query).sort({ updatedAt: -1 });
  const enriched = await Promise.all(
    playlists.map(async (pl: any) => {
      const p = await enrichPlaylist(pl);
      const [videoCount, musicCount] = await Promise.all([
        Device.countDocuments({ videoPlaylistId: p.id }),
        Device.countDocuments({ musicPlaylistId: p.id }),
      ]);
      return {
        ...p,
        _count: { videoDevices: videoCount, musicDevices: musicCount },
      };
    })
  );
  return Response.json({ playlists: enriched });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["video", "music"]),
});

export async function POST(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid playlist");

  await connectMongo();
  const playlist = await Playlist.create({ ...parsed.data, items: [] });
  return Response.json({ playlist: toJSON(playlist) }, { status: 201 });
}
