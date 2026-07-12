import fs from "fs";
import path from "path";
import { getLibraryRoot } from "@/lib/config";
import { getDisplayName, formatCategoryPath } from "@/lib/display";
import { getLockForCategory } from "@/lib/folder-lock";

export type FolderItem = {
  id: string;
  label: string;
  videoCount: number;
  hasVideos: boolean;
  locked: boolean;
};

const VIDEO_EXT = new Set([".mp4", ".webm", ".mkv", ".mov"]);

function isVideo(name: string): boolean {
  return VIDEO_EXT.has(path.extname(name).toLowerCase());
}

function countDirectVideos(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(isVideo).length;
}

function countVideosRecursive(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = countDirectVideos(dir);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      total += countVideosRecursive(path.join(dir, entry.name));
    }
  }
  return total;
}

export function resolveCategoryDir(categoryId: string): string | null {
  if (categoryId.includes("..")) return null;

  const root = path.resolve(getLibraryRoot());
  if (!categoryId) return root;

  const target = path.resolve(path.join(root, ...categoryId.split("/")));
  if (!target.startsWith(root)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return null;

  return target;
}

export function listTopLevel(): FolderItem[] {
  return listSubfolders("");
}

export function listSubfolders(categoryId: string): FolderItem[] {
  const dir = resolveCategoryDir(categoryId);
  if (!dir) return [];

  const items: FolderItem[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    const id = categoryId ? `${categoryId}/${entry.name}` : entry.name;
    const direct = countDirectVideos(full);
    const total = countVideosRecursive(full);
    if (total === 0) continue;

    items.push({
      id,
      label: getDisplayName(id),
      videoCount: total,
      hasVideos: direct > 0,
      locked: !!getLockForCategory(id),
    });
  }

  return items.sort((a, b) => a.label.localeCompare(b.label));
}

export function hasDirectVideos(categoryId: string): boolean {
  const dir = resolveCategoryDir(categoryId);
  if (!dir) return false;
  return countDirectVideos(dir) > 0;
}

export function breadcrumbParts(
  categoryId: string
): { id: string; label: string }[] {
  if (!categoryId) return [];
  const parts = categoryId.split("/");
  return parts.map((label, i) => ({
    label,
    id: parts.slice(0, i + 1).join("/"),
  }));
}
