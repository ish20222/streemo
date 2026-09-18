import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { User } from "@/lib/models";
import { jsonError } from "@/lib/utils";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid credentials");

  await connectMongo();
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return jsonError("Invalid email or password", 401);
  }

  const token = await createSessionToken(String(user._id));
  await setSessionCookie(token);
  return Response.json({
    id: String(user._id),
    email: user.email,
    name: user.name,
  });
}
