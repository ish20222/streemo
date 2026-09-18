import { NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { connectMongo } from "@/lib/db";
import { User } from "@/lib/models";
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

  await connectMongo();
  const count = await User.countDocuments();
  if (count > 0) {
    return jsonError("Registration is closed. Ask an admin to create an account.", 403);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await User.create({
    email: parsed.data.email.toLowerCase(),
    passwordHash,
    name: parsed.data.name || "Admin",
  });

  const token = await createSessionToken(String(user._id));
  await setSessionCookie(token);
  return Response.json({
    id: String(user._id),
    email: user.email,
    name: user.name,
  });
}
