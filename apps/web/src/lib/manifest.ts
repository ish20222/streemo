import { connectMongo } from "./db";
import { Device, Playlist, MediaAsset } from "./models";
import { getDownloadUrl } from "./storage";

export async function buildDeviceManifest(deviceId: string) {
  await connectMongo();
  const device: any = await Device.findById(deviceId).lean();
  if (!device) return null;
  const deviceToken = device.deviceToken as string | null;

  async function mapPlaylistItems(playlistId: string | null | undefined) {
    if (!playlistId) return [];
    const playlist: any = await Playlist.findById(playlistId).lean();
    if (!playlist?.items?.length) return [];
    const sorted = [...playlist.items].sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
    );
    const mediaIds = sorted.map((i: any) => i.mediaId);
    const mediaList: any[] = await MediaAsset.find({
      _id: { $in: mediaIds },
    }).lean();
    const byId = new Map(mediaList.map((m) => [String(m._id), m]));

    const out = [];
    for (const item of sorted) {
      const media = byId.get(String(item.mediaId));
      if (!media) continue;
      out.push({
        position: item.position,
        mediaId: String(media._id),
        type: media.type,
        filename: media.filename,
        mimeType: media.mimeType,
        size: media.size,
        checksum: media.checksum,
        durationSec: media.durationSec ?? null,
        downloadUrl: await getDownloadUrl(
          media.storageKey,
          String(media._id),
          deviceToken
        ),
      });
    }
    return out;
  }

  const videoQueue = device.videoEnabled
    ? await mapPlaylistItems(device.videoPlaylistId)
    : [];
  const musicQueue = device.musicEnabled
    ? await mapPlaylistItems(device.musicPlaylistId)
    : [];

  return {
    deviceId: String(device._id),
    name: device.name,
    videoEnabled: device.videoEnabled,
    musicEnabled: device.musicEnabled,
    audioSink: device.audioSink,
    videoQueue,
    musicQueue,
    generatedAt: new Date().toISOString(),
  };
}
