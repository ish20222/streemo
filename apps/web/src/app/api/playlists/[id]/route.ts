import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deviceHub } from "@/lib/device-hub";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { media: true },
      },
    },
  });
  if (!playlist) return jsonError("Not found", 404);
  return Response.json({ playlist });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid update");

  const playlist = await prisma.playlist.update({
    where: { id },
    data: parsed.data,
  });
  return Response.json({ playlist });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const devices = await prisma.device.findMany({
    where: { OR: [{ videoPlaylistId: id }, { musicPlaylistId: id }] },
    select: { id: true },
  });
  await prisma.playlist.delete({ where: { id } }).catch(() => null);
  for (const d of devices) deviceHub.notifyQueueUpdated(d.id);
  return Response.json({ ok: true });
}
