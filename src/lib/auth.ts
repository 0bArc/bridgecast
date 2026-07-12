import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  getConfig,
  getSessionSecret,
  isSetupComplete,
  verifyPassword,
} from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/constants";

export type SessionRole = "admin" | "viewer";

function sessionToken(role: SessionRole): string {
  const secret = isSetupComplete()
    ? getSessionSecret()
    : process.env.AUTH_SECRET || "dev-insecure";
  return createHmac("sha256", secret)
    .update(`authenticated:${role}`)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(password, expected);
}

export function checkViewerPassword(password: string): boolean {
  const config = getConfig();
  if (!config?.setupComplete) return false;
  const hash = config.viewerPasswordHash;
  return verifyPassword(password, hash);
}

export function resolveLogin(password: string): SessionRole | null {
  if (checkAdminPassword(password)) return "admin";
  if (checkViewerPassword(password)) return "viewer";
  return null;
}

export async function setSession(role: SessionRole): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken(role), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionRole(): Promise<SessionRole | null> {
  if (!isSetupComplete()) return null;
  const jar = await cookies();
  const value = jar.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  if (safeEqual(value, sessionToken("admin"))) return "admin";
  if (safeEqual(value, sessionToken("viewer"))) return "viewer";
  return null;
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSessionRole()) !== null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getSessionRole()) === "admin";
}
