import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const kind = req.nextUrl.searchParams.get("kind");
  const playlists = await prisma.playlist.findMany({
    where: kind ? { kind } : undefined,
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { media: true },
      },
      _count: { select: { videoDevices: true, musicDevices: true } },
    },
  });
  return Response.json({ playlists });
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

  const playlist = await prisma.playlist.create({ data: parsed.data });
  return Response.json({ playlist }, { status: 201 });
}
