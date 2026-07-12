import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import {
  getFolderLocks,
  getSessionSecret,
  verifyPassword,
} from "@/lib/config";
import { FOLDER_UNLOCK_COOKIE } from "@/lib/constants";

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("hex");
}

export function needsFolderUnlock(
  categoryId: string,
  unlocked: string[]
): boolean {
  const lock = getLockForCategory(categoryId);
  return lock ? !unlocked.includes(lock.folderId) : false;
}

/** Hide locked folders until the user has unlocked them. */
export function filterVisibleFolders<T extends { id: string; locked: boolean }>(
  folders: T[],
  unlocked: string[]
): T[] {
  return folders.filter(
    (folder) => !folder.locked || !needsFolderUnlock(folder.id, unlocked)
  );
}

/** Sidebar never lists password-locked folders — use home or unlock flow. */
export function filterSidebarFolders<T extends { id: string; locked: boolean }>(
  folders: T[]
): T[] {
  return folders.filter((folder) => !folder.locked);
}

export function getLockForCategory(
  categoryId: string
): { folderId: string; passwordHash: string } | null {
  const locks = getFolderLocks();
  const normalized = categoryId.replace(/\\/g, "/").replace(/^\/+/, "");

  let best: { folderId: string; passwordHash: string } | null = null;
  for (const [folderId, lock] of Object.entries(locks)) {
    if (normalized === folderId || normalized.startsWith(`${folderId}/`)) {
      if (!best || folderId.length > best.folderId.length) {
        best = { folderId, passwordHash: lock.passwordHash };
      }
    }
  }
  return best;
}

function parseUnlockCookie(value: string | undefined): string[] {
  if (!value) return [];
  const dot = value.lastIndexOf(".");
  if (dot < 1) return [];
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = signPayload(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return [];
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export async function getUnlockedFolders(): Promise<string[]> {
  const jar = await cookies();
  return parseUnlockCookie(jar.get(FOLDER_UNLOCK_COOKIE)?.value);
}

export async function isCategoryAccessible(categoryId: string): Promise<boolean> {
  const lock = getLockForCategory(categoryId);
  if (!lock) return true;
  const unlocked = await getUnlockedFolders();
  return unlocked.includes(lock.folderId);
}

export async function unlockFolder(
  categoryId: string,
  password: string
): Promise<boolean> {
  const lock = getLockForCategory(categoryId);
  if (!lock) return true;
  if (!verifyPassword(password, lock.passwordHash)) return false;

  const jar = await cookies();
  const current = await getUnlockedFolders();
  if (!current.includes(lock.folderId)) {
    current.push(lock.folderId);
  }
  const payload = JSON.stringify(current);
  const token = `${payload}.${signPayload(payload)}`;
  jar.set(FOLDER_UNLOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}
