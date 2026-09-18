import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { Device, Playlist, toJSON } from "@/lib/models";
import { deviceHub } from "@/lib/device-hub";
import { generatePairingCode, jsonError } from "@/lib/utils";

async function hydrateDevice(device: any) {
  const d = toJSON<any>(device);
  const [videoPlaylist, musicPlaylist]: [any, any] = await Promise.all([
    d.videoPlaylistId
      ? Playlist.findById(d.videoPlaylistId).select("name").lean()
      : null,
    d.musicPlaylistId
      ? Playlist.findById(d.musicPlaylistId).select("name").lean()
      : null,
  ]);
  return {
    ...d,
    videoPlaylist: videoPlaylist
      ? { id: String(videoPlaylist._id), name: videoPlaylist.name }
      : null,
    musicPlaylist: musicPlaylist
      ? { id: String(musicPlaylist._id), name: musicPlaylist.name }
      : null,
    liveOnline: deviceHub.isOnline(d.id),
  };
}

export async function GET() {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }

  await connectMongo();
  const devices = await Device.find().sort({ createdAt: -1 });
  const hydrated = await Promise.all(devices.map(hydrateDevice));
  return Response.json({ devices: hydrated });
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

  await connectMongo();
  let pairingCode = generatePairingCode();
  for (let i = 0; i < 5; i++) {
    const exists = await Device.findOne({ pairingCode });
    if (!exists) break;
    pairingCode = generatePairingCode();
  }

  const device = await Device.create({
    name: parsed.data.name,
    location: parsed.data.location ?? null,
    pairingCode,
  });

  return Response.json({ device: toJSON(device) }, { status: 201 });
}
