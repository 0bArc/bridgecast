import fs from "fs";
import path from "path";
import { formatCategoryPath } from "@/lib/display";
import { getFolderLocks, getLibraryRoot } from "@/lib/config";
import type { VideoItem } from "@/serve/video";

export type SearchResult = VideoItem & {
  categoryId: string;
  categoryLabel: string;
};

const VIDEO_EXT = new Set([".mp4", ".webm", ".mkv", ".mov"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function walk(
  dir: string,
  categoryId: string,
  query: string,
  results: SearchResult[]
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childId = categoryId ? `${categoryId}/${entry.name}` : entry.name;
      walk(full, childId, query, results);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    const haystack = entry.name.toLowerCase();
    if (!haystack.includes(query)) continue;
    const stat = fs.statSync(full);
    results.push({
      name: entry.name,
      size: stat.size,
      sizeLabel: formatSize(stat.size),
      categoryId,
      categoryLabel: formatCategoryPath(categoryId),
    });
  }
}

export function searchVideos(
  rawQuery: string,
  unlockedFolderIds: string[]
): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const root = path.resolve(getLibraryRoot());
  if (!fs.existsSync(root)) return [];

  const unlocked = new Set(unlockedFolderIds);
  const results: SearchResult[] = [];

  walk(root, "", query, results);

  return results.filter((r) => {
    const locks = getFolderLocks();
    for (const lockId of Object.keys(locks)) {
      if (
        r.categoryId === lockId ||
        r.categoryId.startsWith(`${lockId}/`)
      ) {
        return unlocked.has(lockId);
      }
    }
    return true;
  });
}
