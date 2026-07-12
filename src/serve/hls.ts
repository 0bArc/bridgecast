import fs from "fs";
import path from "path";
import { createReadStream, type ReadStream } from "fs";

export const HLS_SEGMENT_SECONDS = 4;

export function hlsPlaylistPath(hlsDir: string): string {
  return path.join(hlsDir, "playlist.m3u8");
}

export function hlsCacheValid(hlsDir: string): boolean {
  const playlist = hlsPlaylistPath(hlsDir);
  if (!fs.existsSync(playlist)) return false;
  const text = fs.readFileSync(playlist, "utf8");
  if (!text.includes("#EXTINF")) return false;
  const initMatch = /URI="([^"]+)"/.exec(text);
  if (initMatch) {
    const initPath = path.join(hlsDir, path.basename(initMatch[1]));
    if (!fs.existsSync(initPath)) return false;
  }
  const segment = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(".m4s"));
  if (segment && !fs.existsSync(path.join(hlsDir, segment))) return false;
  return true;
}

export function resolveHlsAssetPath(
  hlsDir: string,
  fileName: string
): string | null {
  const safe = path.basename(fileName);
  if (safe !== fileName || safe.includes("..")) return null;
  const full = path.resolve(path.join(hlsDir, safe));
  const root = path.resolve(hlsDir);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

export function hlsAssetStat(hlsDir: string, fileName: string) {
  const full = resolveHlsAssetPath(hlsDir, fileName);
  if (!full) return null;
  return fs.statSync(full);
}

export function hlsAssetEtag(stat: fs.Stats): string {
  return `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
}

export function hlsAssetContentType(fileName: string): string {
  if (fileName.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (fileName.endsWith(".m4s") || fileName.endsWith(".mp4")) {
    return "video/iso.segment";
  }
  return "application/octet-stream";
}

export function hlsAssetCacheControl(fileName: string): string {
  if (fileName.endsWith(".m3u8")) {
    return "private, max-age=60";
  }
  return "public, max-age=31536000, immutable";
}

export function openHlsAssetStream(
  hlsDir: string,
  fileName: string,
  rangeHeader: string | null
): { stream: ReadStream; stat: fs.Stats; start: number; end: number } | null {
  const full = resolveHlsAssetPath(hlsDir, fileName);
  if (!full) return null;

  const stat = fs.statSync(full);
  const size = stat.size;

  if (!rangeHeader) {
    return {
      stream: createReadStream(full),
      stat,
      start: 0,
      end: size - 1,
    };
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  if (start >= size || end >= size || start > end) return null;

  return {
    stream: createReadStream(full, { start, end }),
    stat,
    start,
    end,
  };
}

export function readHlsAssetText(hlsDir: string, fileName: string): string | null {
  const full = resolveHlsAssetPath(hlsDir, fileName);
  if (!full) return null;
  return fs.readFileSync(full, "utf8");
}

function rewriteMapUri(line: string, baseUrl: string): string {
  return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
    const file = path.basename(uri);
    return `URI="${baseUrl}${encodeURIComponent(file)}"`;
  });
}

/** Rewrite segment paths in m3u8 for API serving. */
export function rewriteHlsPlaylist(content: string, baseUrl: string): string {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return rewriteMapUri(line, baseUrl);
      }
      if (
        trimmed.endsWith(".m3u8") ||
        trimmed.endsWith(".m4s") ||
        trimmed.endsWith(".mp4")
      ) {
        const file = path.basename(trimmed);
        return `${baseUrl}${encodeURIComponent(file)}`;
      }
      return line;
    })
    .join("\n");
}

export type HlsInventory = {
  init: string | null;
  segments: string[];
  segmentCount: number;
  totalBytes: number;
  playlistBytes: number;
};

export function listHlsInventory(hlsDir: string): HlsInventory | null {
  if (!fs.existsSync(hlsDir)) return null;

  let files: string[];
  try {
    files = fs.readdirSync(hlsDir);
  } catch {
    return null;
  }

  const segments = files.filter((f) => f.endsWith(".m4s")).sort();
  const init = files.find((f) => f.endsWith(".mp4")) ?? null;

  let totalBytes = 0;
  for (const name of files) {
    try {
      totalBytes += fs.statSync(path.join(hlsDir, name)).size;
    } catch {
      /* skip */
    }
  }

  let playlistBytes = 0;
  const playlist = hlsPlaylistPath(hlsDir);
  if (fs.existsSync(playlist)) {
    try {
      playlistBytes = fs.statSync(playlist).size;
    } catch {
      /* skip */
    }
  }

  return {
    init,
    segments,
    segmentCount: segments.length,
    totalBytes,
    playlistBytes,
  };
}

export function removeHlsDir(hlsDir: string): void {
  if (!fs.existsSync(hlsDir)) return;
  try {
    fs.rmSync(hlsDir, { recursive: true, force: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM" || code === "ENOENT") return;
    throw err;
  }
}

/** Remove orphan fmp4 segments ffmpeg wrote to project root (bad relative paths). */
export function cleanupStrayHlsArtifacts(rootDir: string): number {
  let removed = 0;
  if (!fs.existsSync(rootDir)) return 0;
  for (const name of fs.readdirSync(rootDir)) {
    const full = path.join(rootDir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (
      name.endsWith(".m4s") ||
      /^seg\d+\.m4s$/i.test(name) ||
      (name === "init.mp4" && !full.includes(`${path.sep}.cache${path.sep}`))
    ) {
      try {
        fs.unlinkSync(full);
        removed++;
      } catch {
        /* busy */
      }
    }
  }
  return removed;
}

export async function generateHlsFromMp4(
  mp4Path: string,
  hlsDir: string,
  runFfmpeg: (
    args: string[],
    timeoutMs: number,
    cwd?: string
  ) => Promise<void>
): Promise<void> {
  fs.mkdirSync(hlsDir, { recursive: true });

  const tmpDir = `${hlsDir}.part.${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await runFfmpeg(
      [
        "-y",
        "-i",
        mp4Path,
        "-c",
        "copy",
        "-f",
        "hls",
        "-hls_time",
        String(HLS_SEGMENT_SECONDS),
        "-hls_playlist_type",
        "vod",
        "-hls_segment_type",
        "fmp4",
        "-hls_fmp4_init_filename",
        "init.mp4",
        "-hls_segment_filename",
        "seg%03d.m4s",
        "-hls_flags",
        "independent_segments",
        "playlist.m3u8",
      ],
      1_800_000,
      tmpDir
    );

    if (!hlsCacheValid(tmpDir)) {
      throw new Error("HLS output missing playlist or segments");
    }

    if (fs.existsSync(hlsDir)) {
      removeHlsDir(hlsDir);
    }
    fs.renameSync(tmpDir, hlsDir);
  } catch (err) {
    removeHlsDir(tmpDir);
    throw err;
  }
}
