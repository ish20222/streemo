import { prisma } from "./prisma";
import { getDownloadUrl } from "./storage";

export async function buildDeviceManifest(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    include: {
      videoPlaylist: {
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { media: true },
          },
        },
      },
      musicPlaylist: {
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { media: true },
          },
        },
      },
    },
  });

  if (!device) return null;
  const deviceToken = device.deviceToken;

  async function mapItems(
    items: { position: number; media: { id: string; filename: string; mimeType: string; size: number; checksum: string; storageKey: string; durationSec: number | null; type: string } }[]
  ) {
    return Promise.all(
      items.map(async (item) => ({
        position: item.position,
        mediaId: item.media.id,
        type: item.media.type,
        filename: item.media.filename,
        mimeType: item.media.mimeType,
        size: item.media.size,
        checksum: item.media.checksum,
        durationSec: item.media.durationSec,
        downloadUrl: await getDownloadUrl(
          item.media.storageKey,
          item.media.id,
          deviceToken
        ),
      }))
    );
  }

  const videoQueue =
    device.videoEnabled && device.videoPlaylist
      ? await mapItems(device.videoPlaylist.items)
      : [];
  const musicQueue =
    device.musicEnabled && device.musicPlaylist
      ? await mapItems(device.musicPlaylist.items)
      : [];

  return {
    deviceId: device.id,
    name: device.name,
    videoEnabled: device.videoEnabled,
    musicEnabled: device.musicEnabled,
    audioSink: device.audioSink,
    videoQueue,
    musicQueue,
    generatedAt: new Date().toISOString(),
  };
}
