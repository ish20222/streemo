import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { deviceHub } from "@/lib/device-hub";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum([
    "pause",
    "resume",
    "skip_video",
    "skip_music",
    "reload",
    "clear_cache",
  ]),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await requireUser();
  } catch (e) {
    return e as Response;
  }
  const { id } = await ctx.params;
  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) return jsonError("Device not found", 404);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid command");

  const sent = deviceHub.send(id, {
    type: "command",
    action: parsed.data.action,
  });

  return Response.json({ ok: true, delivered: sent });
}
