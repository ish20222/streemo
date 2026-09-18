import { connectMongo } from "./db";
import { User, Device, MediaAsset, Playlist, toJSON } from "./models";

/** Ensure DB is connected, then expose models (Prisma-like entry). */
export async function db() {
  await connectMongo();
  return { User, Device, MediaAsset, Playlist, toJSON };
}

export { connectMongo, User, Device, MediaAsset, Playlist, toJSON };
