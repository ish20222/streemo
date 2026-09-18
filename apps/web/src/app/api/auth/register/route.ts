import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid email or password");

  const count = await prisma.user.count();
  if (count > 0) {
    return jsonError("Registration is closed. Ask an admin to create an account.", 403);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      name: parsed.data.name || "Admin",
    },
  });

  const token = await createSessionToken(user.id);
  await setSessionCookie(token);
  return Response.json({ id: user.id, email: user.email, name: user.name });
}
