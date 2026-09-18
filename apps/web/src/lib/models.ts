import { customAlphabet } from "nanoid";
import { Schema, models, model } from "mongoose";

const id = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);

function withIdTransforms(schema: Schema) {
  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      if (ret._id != null) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      return ret;
    },
  });
  schema.set("toObject", {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      if (ret._id != null) {
        ret.id = String(ret._id);
        delete ret._id;
      }
      return ret;
    },
  });
}

const UserSchema = new Schema(
  {
    _id: { type: String, default: () => id() },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String },
  },
  { timestamps: true }
);
withIdTransforms(UserSchema);

const PlaybackStateSchema = new Schema(
  {
    videoMediaId: { type: String, default: null },
    musicMediaId: { type: String, default: null },
    videoPositionSec: { type: Number, default: null },
    musicPositionSec: { type: Number, default: null },
    videoStatus: { type: String, default: "idle" },
    musicStatus: { type: String, default: "idle" },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DeviceSchema = new Schema(
  {
    _id: { type: String, default: () => id() },
    name: { type: String, required: true },
    location: { type: String, default: null },
    pairingCode: { type: String, required: true, unique: true },
    deviceToken: { type: String, default: null, sparse: true, unique: true },
    status: { type: String, default: "offline" },
    lastSeenAt: { type: Date, default: null },
    videoEnabled: { type: Boolean, default: true },
    musicEnabled: { type: Boolean, default: true },
    audioSink: { type: String, default: "analog" },
    videoPlaylistId: { type: String, default: null },
    musicPlaylistId: { type: String, default: null },
    playbackState: { type: PlaybackStateSchema, default: null },
  },
  { timestamps: true }
);
withIdTransforms(DeviceSchema);

const MediaAssetSchema = new Schema(
  {
    _id: { type: String, default: () => id() },
    type: { type: String, required: true }, // video | audio
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    durationSec: { type: Number, default: null },
    storageKey: { type: String, required: true },
    checksum: { type: String, required: true },
  },
  { timestamps: true }
);
withIdTransforms(MediaAssetSchema);
MediaAssetSchema.index({ checksum: 1 });

const PlaylistItemSchema = new Schema(
  {
    _id: { type: String, default: () => id() },
    mediaId: { type: String, required: true },
    position: { type: Number, required: true },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
withIdTransforms(PlaylistItemSchema);

const PlaylistSchema = new Schema(
  {
    _id: { type: String, default: () => id() },
    name: { type: String, required: true },
    kind: { type: String, required: true }, // video | music
    items: { type: [PlaylistItemSchema], default: [] },
  },
  { timestamps: true }
);
withIdTransforms(PlaylistSchema);

export type UserDoc = any;
export type DeviceDoc = any;
export type MediaAssetDoc = any;
export type PlaylistDoc = any;

export const User = (models.User || model("User", UserSchema)) as any;
export const Device = (models.Device || model("Device", DeviceSchema)) as any;
export const MediaAsset = (models.MediaAsset ||
  model("MediaAsset", MediaAssetSchema)) as any;
export const Playlist = (models.Playlist ||
  model("Playlist", PlaylistSchema)) as any;

/** Serialize mongoose doc(s) to plain objects with `id`. */
export function toJSON<T = any>(doc: any): T {
  if (doc == null) return doc;
  if (Array.isArray(doc)) return doc.map((d) => toJSON(d)) as T;
  if (typeof doc.toJSON === "function") return doc.toJSON() as T;
  return doc as T;
}
