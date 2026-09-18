import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid credentials");

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Invalid email or password", 401);
  }

  const token = await createSessionToken(user.id);
  await setSessionCookie(token);
  return Response.json({ id: user.id, email: user.email, name: user.name });
}
