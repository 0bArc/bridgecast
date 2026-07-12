import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), ".cache", "durations.json");

type DurationEntry = {
  duration: number;
  size: number;
  mtimeMs: number;
};

let cache: Record<string, DurationEntry> | null = null;
const probing = new Set<string>();

function loadCache(): Record<string, DurationEntry> {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_PATH)) {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as Record<
        string,
        DurationEntry
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

function fileStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/** Disk cache only — never spawns ffprobe (safe for page renders + status polls). */
export function getVideoDurationFast(filePath: string): number | null {
  const stat = fileStat(filePath);
  if (!stat) return null;
  const entry = loadCache()[filePath];
  if (
    entry &&
    entry.size === stat.size &&
    entry.mtimeMs === stat.mtimeMs &&
    entry.duration > 0
  ) {
    return entry.duration;
  }
  return null;
}

function probeDurationSync(filePath: string): number | null {
  try {
    const stdout = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 15_000 }
    );
    const duration = Number.parseFloat(stdout.toString().trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

export function cacheVideoDuration(
  filePath: string,
  duration: number
): void {
  const stat = fileStat(filePath);
  if (!stat || duration <= 0) return;
  const store = loadCache();
  store[filePath] = {
    duration,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
  saveCache();
}

/** Probe once, persist to disk cache. */
export function probeAndCacheDuration(filePath: string): number | null {
  const existing = getVideoDurationFast(filePath);
  if (existing) return existing;
  const duration = probeDurationSync(filePath);
  if (duration) cacheVideoDuration(filePath, duration);
  return duration;
}

/** Background ffprobe for library cards — never blocks HTTP response. */
export function prewarmDurations(filePaths: string[]): void {
  for (const filePath of filePaths) {
    if (getVideoDurationFast(filePath) || probing.has(filePath)) continue;
    probing.add(filePath);
    setImmediate(() => {
      try {
        probeAndCacheDuration(filePath);
      } finally {
        probing.delete(filePath);
      }
    });
  }
}
