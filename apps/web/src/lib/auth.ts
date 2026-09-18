import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const AUTH_COOKIE = "streemo_session";

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

function getDeviceSecret() {
  const secret = process.env.DEVICE_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("DEVICE_TOKEN_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({ sub: userId, typ: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getAuthSecret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (payload.typ !== "user" || typeof payload.sub !== "string") return null;
    return prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

export async function createDeviceToken(deviceId: string) {
  return new SignJWT({ sub: deviceId, typ: "device" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(getDeviceSecret());
}

export async function verifyDeviceToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getDeviceSecret());
    if (payload.typ !== "device" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function getBearerToken(req: NextRequest | Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export { AUTH_COOKIE };
