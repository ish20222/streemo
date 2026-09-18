import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const media = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!media) return jsonError("Not found", 404);

  await deleteObject(media.storageKey);
  await prisma.mediaAsset.delete({ where: { id } });
  return Response.json({ ok: true });
}
