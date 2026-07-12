import fs from "fs";
import path from "path";
import { resolveCategoryDir } from "@/serve/library";

export type VideoItem = {
  name: string;
  size: number;
  sizeLabel: string;
};

export type VideoSort = "name-asc" | "name-desc" | "size-asc" | "size-desc";

export const DEFAULT_VIDEO_SORT: VideoSort = "name-asc";

const VIDEO_EXT = new Set([".mp4", ".webm", ".mkv", ".mov"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function safeVideoName(name: string): string | null {
  const base = path.basename(name);
  if (base !== name || base.includes("..")) return null;
  const ext = path.extname(base).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return null;
  return base;
}

export function resolveVideoPath(
  name: string,
  categoryId: string
): string | null {
  const safe = safeVideoName(name);
  const dir = resolveCategoryDir(categoryId);
  if (!safe || !dir) return null;

  const full = path.join(dir, safe);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(path.resolve(dir))) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function parseVideoSort(value?: string): VideoSort {
  if (
    value === "name-desc" ||
    value === "size-asc" ||
    value === "size-desc"
  ) {
    return value;
  }
  return DEFAULT_VIDEO_SORT;
}

export function sortVideos(videos: VideoItem[], sort: VideoSort): VideoItem[] {
  const sorted = [...videos];
  const byName = (a: VideoItem, b: VideoItem) =>
    a.name.localeCompare(b.name, undefined, { numeric: true });

  switch (sort) {
    case "name-desc":
      return sorted.sort((a, b) => byName(b, a));
    case "size-asc":
      return sorted.sort((a, b) => a.size - b.size || byName(a, b));
    case "size-desc":
      return sorted.sort((a, b) => b.size - a.size || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

export function listVideos(categoryId: string): VideoItem[] {
  const dir = resolveCategoryDir(categoryId);
  if (!dir) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return {
        name,
        size: stat.size,
        sizeLabel: formatSize(stat.size),
      };
    });
}

export function createVideoStreamResponse(
  filePath: string,
  rangeHeader: string | null,
  isPreview = false
): Response {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".webm"
      ? "video/webm"
      : ext === ".mkv"
        ? "video/x-matroska"
        : ext === ".mov"
          ? "video/quicktime"
          : "video/mp4";

  /** Segments/init are immutable on disk — strong cache saves iPad radio + CPU. */
  const immutable =
    filePath.includes(`${path.sep}.cache${path.sep}transcodes${path.sep}`) &&
    !isPreview;
  const cacheControl = immutable
    ? "public, max-age=31536000, immutable"
    : isPreview
      ? "private, max-age=86400"
      : "private, max-age=3600";

  // Never dump multi-GB files when client omits Range (Safari sometimes probes).
  const LARGE = 8 * 1024 * 1024;
  if (!rangeHeader && fileSize > LARGE) {
    const end = Math.min(fileSize - 1, 1024 * 1024 - 1);
    const stream = fs.createReadStream(filePath, { start: 0, end });
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Range": `bytes 0-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end + 1),
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  }

  if (!rangeHeader) {
    const stream = fs.createReadStream(filePath);
    return new Response(stream as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      },
    });
  }

  // Safari/iOS may send suffix ranges: bytes=-500 (last 500 bytes).
  const suffix = /^bytes=-(\d+)$/.exec(rangeHeader);
  if (suffix) {
    const suffixLen = Number.parseInt(suffix[1], 10);
    const start = Math.max(0, fileSize - suffixLen);
    const end = fileSize - 1;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    return new Response(stream as unknown as BodyInit, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${fileSize}` },
    });
  }

  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });

  return new Response(stream as unknown as BodyInit, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkSize),
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
    },
  });
}
