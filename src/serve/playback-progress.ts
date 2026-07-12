import fs from "fs";
import path from "path";
import { videoSourceKey } from "@/serve/transcode";

const CACHE_PATH = path.join(process.cwd(), ".cache", "playback-progress.json");
const MIN_RESUME_SECONDS = 5;
const END_BUFFER_SECONDS = 30;

type ProgressEntry = {
  position: number;
  duration: number | null;
  updatedAt: number;
};

let cache: Record<string, ProgressEntry> | null = null;

function loadCache(): Record<string, ProgressEntry> {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as Record<
        string,
        ProgressEntry
      >;
      return cache;
    }
  } catch {
    /* corrupt cache */
  }
  cache = {};
  return cache;
}

function saveCache(): void {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache ?? {}, null, 2), "utf8");
}

function progressKey(filePath: string): string {
  return videoSourceKey(filePath);
}

function isResumable(position: number, duration: number | null): boolean {
  if (!Number.isFinite(position) || position < MIN_RESUME_SECONDS) return false;
  if (duration && duration > 0 && position >= duration - END_BUFFER_SECONDS) {
    return false;
  }
  return true;
}

export function getPlaybackPosition(filePath: string): number | null {
  const entry = loadCache()[progressKey(filePath)];
  if (!entry) return null;
  if (!isResumable(entry.position, entry.duration)) return null;
  return entry.position;
}

export function setPlaybackPosition(
  filePath: string,
  position: number,
  duration: number | null = null
): void {
  if (!Number.isFinite(position) || position < 0) return;

  const key = progressKey(filePath);
  const data = loadCache();

  if (
    duration &&
    duration > 0 &&
    position >= duration - END_BUFFER_SECONDS
  ) {
    delete data[key];
    saveCache();
    return;
  }

  if (position < MIN_RESUME_SECONDS) {
    delete data[key];
    saveCache();
    return;
  }

  data[key] = {
    position,
    duration: duration && duration > 0 ? duration : data[key]?.duration ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  saveCache();
}

export function clearPlaybackPosition(filePath: string): void {
  const key = progressKey(filePath);
  const data = loadCache();
  if (!data[key]) return;
  delete data[key];
  saveCache();
}
