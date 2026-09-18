import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { MediaAsset, Playlist } from "@/lib/models";
import { deleteObject } from "@/lib/storage";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  await connectMongo();
  const media = await MediaAsset.findById(id);
  if (!media) return jsonError("Not found", 404);

  await deleteObject(media.storageKey);
  await MediaAsset.findByIdAndDelete(id);
  await Playlist.updateMany({}, { $pull: { items: { mediaId: id } } });
  return Response.json({ ok: true });
}
