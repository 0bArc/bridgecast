import {
  getVideoDurationFast,
  probeAndCacheDuration,
} from "@/serve/duration-cache";
import { hlsCacheValid, removeHlsDir } from "@/serve/hls";
import { logCleanup } from "@/serve/playback-debug";
import { createHash } from "crypto";
import { execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

const IPAD_NATIVE = new Set([".mp4", ".m4v", ".mov"]);
const NEEDS_REMUX = new Set([".mkv", ".webm"]);
const TRANSCODE_VERSION = 3;
export const HLS_CACHE_VERSION = 2;
const TRANSCODE_DIR = path.join(process.cwd(), ".cache", "transcodes");
const MANIFEST_PATH = path.join(TRANSCODE_DIR, "manifest.json");

let transcoding = 0;
const transcodeQueue: Array<() => void> = [];
const inFlight = new Map<string, Promise<string>>();
const activeOutputs = new Set<string>();
const lastErrors = new Map<string, string>();
const lastKickAt = new Map<string, number>();
const KICK_COOLDOWN_MS = 5000;

export type TranscodeProgress = {
  percent: number;
  sourceDuration: number;
  processedSeconds: number;
  etaSeconds: number | null;
};

const progress = new Map<string, TranscodeProgress>();
const sourceDurations = new Map<string, number>();

const MAX_TRANSCODE = 1;

export const HLS_IDLE_SECONDS = 24 * 60 * 60;

type ManifestEntry = {
  file: string;
  hlsDir?: string;
  hlsVersion?: number;
  /** Unix seconds — last HLS playlist/segment request. */
  hlsLastUsedAt?: number;
  version: number;
  completedAt: number;
};

type Manifest = Record<string, ManifestEntry>;

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      transcoding++;
      resolve();
    };
    if (transcoding < MAX_TRANSCODE) start();
    else transcodeQueue.push(start);
  });
}

function release() {
  transcoding--;
  const next = transcodeQueue.shift();
  if (next) next();
}

export function needsRemux(filePath: string): boolean {
  return NEEDS_REMUX.has(path.extname(filePath).toLowerCase());
}

type VideoStreamProbe = {
  codec: string;
  pixFmt: string;
  profile: string;
  rFrameRate: number | null;
  avgFrameRate: number | null;
};

const videoProbeCache = new Map<string, VideoStreamProbe | null>();

function parseFps(value: string): number | null {
  const parts = value.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (den > 0 && num > 0) return num / den;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function probeVideoStreamSync(filePath: string): VideoStreamProbe | null {
  try {
    const stdout = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,pix_fmt,profile,r_frame_rate,avg_frame_rate",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 30_000 }
    );
    const data = JSON.parse(stdout.toString()) as {
      streams?: Array<Record<string, string>>;
    };
    const stream = data.streams?.[0];
    if (!stream) return null;
    return {
      codec: (stream.codec_name || "").toLowerCase(),
      pixFmt: (stream.pix_fmt || "").toLowerCase(),
      profile: (stream.profile || "").toLowerCase(),
      rFrameRate: parseFps(stream.r_frame_rate || ""),
      avgFrameRate: parseFps(stream.avg_frame_rate || ""),
    };
  } catch {
    return null;
  }
}

function getVideoProbe(filePath: string): VideoStreamProbe | null {
  try {
    const stat = fs.statSync(filePath);
    const key = `${filePath}|${stat.size}|${stat.mtimeMs}`;
    if (videoProbeCache.has(key)) return videoProbeCache.get(key) ?? null;
    const probe = probeVideoStreamSync(filePath);
    videoProbeCache.set(key, probe);
    return probe;
  } catch {
    return null;
  }
}

/** Codecs we can remux into MP4 with -c:v copy (fast ~2 min). Re-encode only on failure. */
const COPY_SAFE_VIDEO_CODECS = new Set(["h264", "hevc", "h265"]);

function needsPlaybackEncode(probe: VideoStreamProbe): boolean {
  if (COPY_SAFE_VIDEO_CODECS.has(probe.codec)) {
    if (probe.codec !== "h264") return false;
    if (probe.pixFmt.includes("10") || probe.pixFmt.includes("12")) return true;
    if (probe.profile.includes("high 10") || probe.profile.includes("422")) {
      return true;
    }
    return false;
  }
  return true;
}

/** True when source should be cached to smooth H.264 MP4 (MKV/WebM or bad MP4/MOV). */
export function needsPlaybackCache(filePath: string): boolean {
  if (needsRemux(filePath)) return true;
  const ext = path.extname(filePath).toLowerCase();
  if (!IPAD_NATIVE.has(ext)) return false;
  const probe = getVideoProbe(filePath);
  return probe !== null && needsPlaybackEncode(probe);
}

export function isIpadNative(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!IPAD_NATIVE.has(ext)) return false;
  return !needsPlaybackCache(filePath);
}

function sourceKey(filePath: string): string {
  const stat = fs.statSync(filePath);
  return createHash("sha256")
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 20);
}

function cacheHash(filePath: string): string {
  const stat = fs.statSync(filePath);
  return createHash("sha256")
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}|v${TRANSCODE_VERSION}`)
    .digest("hex")
    .slice(0, 20);
}

function ensureTranscodeDir(): void {
  fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
}

function cachePath(filePath: string): string {
  ensureTranscodeDir();
  return path.join(TRANSCODE_DIR, `${cacheHash(filePath)}.mp4`);
}

function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Manifest): void {
  ensureTranscodeDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeUnlink(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM") return;
    throw err;
  }
}

/** Windows often keeps .part.mp4 locked briefly after ffmpeg exits. */
async function finalizePartFile(tmp: string, out: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      safeUnlink(out);
      fs.renameSync(tmp, out);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM") throw err;

      if (attempt >= 10) {
        try {
          fs.copyFileSync(tmp, out);
          safeUnlink(tmp);
          return;
        } catch {
          /* retry */
        }
      }
      await sleep(Math.min(400 * (attempt + 1), 4000));
    }
  }
  throw new Error(
    `Could not finalize transcode (file locked): ${path.basename(tmp)}`
  );
}

function cleanupStaleParts(): void {
  ensureTranscodeDir();
  for (const name of fs.readdirSync(TRANSCODE_DIR)) {
    const full = path.join(TRANSCODE_DIR, name);
    if (activeOutputs.has(full)) continue;

    // Adopted on demand via tryAdoptPartFile — only remove timestamp temps.
    if (/^[a-f0-9]{20}\.part\.mp4$/.test(name)) continue;

    if (name.includes(".part.mp4")) {
      safeUnlink(full);
      logCleanup(`removed stale part mp4 ${name}`);
      continue;
    }

    if (/\.part\.\d+$/.test(name)) {
      removeHlsDir(full);
      logCleanup(`removed stale HLS temp dir ${name}`);
    }
  }
}

/** Link valid on-disk HLS dirs into manifest after crash/restart before orphan cleanup. */
function adoptOrphanHlsCaches(): void {
  const manifest = readManifest();
  let changed = false;

  for (const [key, entry] of Object.entries(manifest)) {
    if (entry.hlsDir || entry.version !== TRANSCODE_VERSION) continue;
    const hash = entry.file.replace(/\.mp4$/i, "");
    if (!/^[a-f0-9]{20}$/.test(hash)) continue;

    const hlsDir = path.join(TRANSCODE_DIR, hash);
    if (!hlsCacheValid(hlsDir)) continue;

    entry.hlsDir = hash;
    entry.hlsVersion = HLS_CACHE_VERSION;
    entry.hlsLastUsedAt = Math.floor(Date.now() / 1000);
    manifest[key] = entry;
    changed = true;
  }

  if (changed) writeManifest(manifest);
}

function cleanupInvalidOrphans(): void {
  ensureTranscodeDir();
  const manifest = readManifest();
  const referenced = new Set(Object.values(manifest).map((e) => e.file));
  const referencedHls = new Set(
    Object.values(manifest)
      .map((e) => e.hlsDir)
      .filter(Boolean) as string[]
  );

  for (const name of fs.readdirSync(TRANSCODE_DIR)) {
    if (name === "manifest.json" || referenced.has(name) || referencedHls.has(name)) {
      continue;
    }
    const full = path.join(TRANSCODE_DIR, name);
    if (activeOutputs.has(full)) continue;

    try {
      if (name.endsWith(".part.mp4") || /\.part\.\d+$/.test(name)) {
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
          removeHlsDir(full);
          logCleanup(`orphan HLS part dir removed ${name}`);
        } else if (!/^[a-f0-9]{20}\.part\.mp4$/.test(name)) {
          safeUnlink(full);
          logCleanup(`orphan part mp4 removed ${name}`);
        }
        continue;
      }

      let isDir = false;
      try {
        isDir = fs.statSync(full).isDirectory();
      } catch {
        continue;
      }

      if (isDir) {
        if (/^[a-f0-9]{20}$/.test(name) && hlsCacheValid(full)) continue;
        removeHlsDir(full);
        logCleanup(`orphan HLS dir removed ${name}`);
        continue;
      }

      if (name.endsWith(".mp4")) {
        if (/^[a-f0-9]{20}\.mp4$/.test(name)) continue;
        safeUnlink(full);
        logCleanup(`orphan file removed ${name}`);
      }
    } catch {
      /* locked or gone — skip */
    }
  }
}

let transcodeStartupDone = false;

/** Deferred so dev HMR does not run fs cleanup on every hot reload. */
export function ensureTranscodeStartup(): void {
  if (transcodeStartupDone) return;
  transcodeStartupDone = true;
  adoptOrphanHlsCaches();
  cleanupStaleParts();
  cleanupInvalidOrphans();
}

export function videoSourceKey(filePath: string): string {
  return sourceKey(filePath);
}

export function videoCacheHash(filePath: string): string {
  return cacheHash(filePath);
}

export function getTranscodeDir(): string {
  return TRANSCODE_DIR;
}

export function findCachedMp4(filePath: string): string | null {
  return findValidCache(filePath);
}

export function updateManifestHlsEntry(
  filePath: string,
  mp4Basename: string,
  hlsDirBasename: string
): void {
  const key = sourceKey(filePath);
  const manifest = readManifest();
  const now = Math.floor(Date.now() / 1000);
  const entry = manifest[key] ?? {
    file: mp4Basename,
    version: TRANSCODE_VERSION,
    completedAt: Date.now(),
  };
  entry.file = mp4Basename;
  entry.hlsDir = hlsDirBasename;
  entry.hlsVersion = HLS_CACHE_VERSION;
  entry.hlsLastUsedAt = now;
  manifest[key] = entry;
  writeManifest(manifest);
}

export function touchManifestHlsAccess(filePath: string): void {
  const key = sourceKey(filePath);
  const manifest = readManifest();
  const entry = manifest[key];
  if (!entry?.hlsDir) return;
  entry.hlsLastUsedAt = Math.floor(Date.now() / 1000);
  manifest[key] = entry;
  writeManifest(manifest);
}

export function clearManifestHlsEntry(key: string): void {
  const manifest = readManifest();
  const entry = manifest[key];
  if (!entry?.hlsDir) return;
  delete entry.hlsDir;
  delete entry.hlsVersion;
  delete entry.hlsLastUsedAt;
  manifest[key] = entry;
  writeManifest(manifest);
}

export function getManifestEntry(filePath: string): ManifestEntry | undefined {
  return readManifest()[sourceKey(filePath)];
}

export function clearManifestHlsForFile(filePath: string): void {
  clearManifestHlsEntry(sourceKey(filePath));
}

/** Sentinel in manifest.file when HLS was packaged from source (no remux cache). */
export const HLS_NATIVE_MANIFEST = "@native";

/** HLS kept until source changes (manifest key rotates); no idle eviction. */
export function evictExpiredHlsCaches(
  _hasViewers: (key: string) => boolean,
  _isPreparing: (key: string) => boolean
): number {
  return 0;
}

export function isNativeHlsManifestEntry(fileField: string): boolean {
  return fileField === HLS_NATIVE_MANIFEST || fileField.startsWith("@native");
}

export function isMp4TranscodeInFlight(filePath: string): boolean {
  return inFlight.has(filePath);
}
function registerCache(filePath: string, cacheFile: string): void {
  const key = sourceKey(filePath);
  const manifest = readManifest();
  const prev = manifest[key];
  const fileName = path.basename(cacheFile);

  manifest[key] = {
    file: fileName,
    hlsDir: prev?.hlsDir,
    hlsVersion: prev?.hlsVersion,
    version: TRANSCODE_VERSION,
    completedAt: Date.now(),
  };
  writeManifest(manifest);

  if (prev?.file && prev.file !== fileName) {
    safeUnlink(path.join(TRANSCODE_DIR, prev.file));
  }

  cleanupStaleParts();
  cleanupInvalidOrphans();
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
      { timeout: 30_000 }
    );
    const duration = Number.parseFloat(stdout.toString().trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

type AudioStreamProbe = {
  codec: string;
  channels: number;
};

function probeAudioStreamSync(filePath: string): AudioStreamProbe | null {
  try {
    const stdout = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=codec_name,channels",
        "-of",
        "json",
        filePath,
      ],
      { timeout: 30_000 }
    );
    const data = JSON.parse(stdout.toString()) as {
      streams?: Array<{ codec_name?: string; channels?: number }>;
    };
    const stream = data.streams?.[0];
    if (!stream) return null;
    return {
      codec: (stream.codec_name || "").toLowerCase(),
      channels: Number(stream.channels) || 0,
    };
  } catch {
    return null;
  }
}

function probeAudioChannelsSync(filePath: string): number {
  try {
    const stdout = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=channels",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 30_000 }
    );
    return Number.parseInt(stdout.toString().trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function durationMatches(source: string, output: string): boolean {
  const srcDur = probeDurationSync(source);
  const outDur = probeDurationSync(output);
  if (!srcDur || !outDur) return false;
  const slack = Math.max(30, srcDur * 0.02);
  return outDur >= srcDur - slack;
}

function cacheValid(source: string, cached: string): boolean {
  if (!fs.existsSync(cached)) return false;
  if (fs.statSync(cached).size === 0) return false;
  if (!durationMatches(source, cached)) return false;
  const channels = probeAudioChannelsSync(cached);
  return channels >= 1 && channels <= 2;
}

function findValidCache(filePath: string): string | null {
  const manifest = readManifest();
  const key = sourceKey(filePath);
  const entry = manifest[key];

  if (entry?.version === TRANSCODE_VERSION) {
    const fromManifest = path.join(TRANSCODE_DIR, entry.file);
    if (cacheValid(filePath, fromManifest)) return fromManifest;
  }

  const expected = cachePath(filePath);
  if (cacheValid(filePath, expected)) {
    registerCache(filePath, expected);
    return expected;
  }

  return null;
}

function getSourceDuration(filePath: string, probe = false): number | null {
  const cached = sourceDurations.get(filePath);
  if (cached) return cached;
  const disk = getVideoDurationFast(filePath);
  if (disk) {
    sourceDurations.set(filePath, disk);
    return disk;
  }
  if (!probe) return null;
  const duration = probeAndCacheDuration(filePath);
  if (duration) sourceDurations.set(filePath, duration);
  return duration;
}

function setProgress(
  filePath: string,
  sourceDuration: number,
  processedSeconds: number,
  startedAt: number
): void {
  const percent = Math.min(
    99,
    Math.max(0, Math.round((processedSeconds / sourceDuration) * 100))
  );
  const elapsed = (Date.now() - startedAt) / 1000;
  let etaSeconds: number | null = null;
  if (processedSeconds >= 0.25 && elapsed >= 1) {
    const rate = processedSeconds / elapsed;
    if (rate > 0) {
      etaSeconds = Math.round(
        Math.max(0, sourceDuration - processedSeconds) / rate
      );
    }
  } else if (percent > 0 && elapsed >= 2) {
    etaSeconds = Math.round((elapsed / percent) * (100 - percent));
  }
  progress.set(filePath, {
    percent,
    sourceDuration,
    processedSeconds,
    etaSeconds,
  });
}

type VideoEncoder = {
  name: string;
  inputArgs: string[];
  encodeArgs: string[];
};

let cachedVideoEncoder: VideoEncoder | undefined;
const failedEncoders = new Set<string>();

function softwareVideoEncoder(): VideoEncoder {
  return {
    name: "libx264",
    inputArgs: [],
    encodeArgs: [
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "0",
    ],
  };
}

function nvencEncoder(): VideoEncoder {
  return {
    name: "nvenc",
    inputArgs: [],
    encodeArgs: [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p4",
      "-tune",
      "hq",
      "-rc",
      "vbr",
      "-cq",
      "23",
      "-b:v",
      "0",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
    ],
  };
}

function qsvEncoder(): VideoEncoder {
  return {
    name: "qsv",
    inputArgs: [],
    encodeArgs: [
      "-c:v",
      "h264_qsv",
      "-global_quality",
      "23",
      "-profile:v",
      "high",
    ],
  };
}

function amfEncoder(): VideoEncoder {
  return {
    name: "amf",
    inputArgs: [],
    encodeArgs: [
      "-c:v",
      "h264_amf",
      "-usage",
      "transcoding",
      "-quality",
      "balanced",
      "-rc",
      "cqp",
      "-qp_i",
      "23",
      "-qp_p",
      "23",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
    ],
  };
}

function probeEncoderWorks(encoder: VideoEncoder): boolean {
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=640x480:d=0.1",
        ...encoder.encodeArgs,
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: 20_000, stdio: ["ignore", "ignore", "pipe"] }
    );
    return true;
  } catch {
    return false;
  }
}

function encoderCandidates(listing: string): VideoEncoder[] {
  const out: VideoEncoder[] = [];
  // AMD first — NVENC probe wastes time and fails without nvcuda.dll
  if (listing.includes("h264_amf")) out.push(amfEncoder());
  if (listing.includes("h264_qsv")) out.push(qsvEncoder());
  if (listing.includes("h264_nvenc")) out.push(nvencEncoder());
  return out;
}

function invalidateVideoEncoder(name: string): void {
  failedEncoders.add(name);
  if (cachedVideoEncoder?.name === name) {
    cachedVideoEncoder = undefined;
  }
}

function detectVideoEncoder(): VideoEncoder {
  if (cachedVideoEncoder) return cachedVideoEncoder;

  try {
    const listing = execFileSync("ffmpeg", ["-hide_banner", "-encoders"], {
      timeout: 10_000,
      encoding: "utf8",
    });
    for (const candidate of encoderCandidates(listing)) {
      if (failedEncoders.has(candidate.name)) continue;
      if (probeEncoderWorks(candidate)) {
        cachedVideoEncoder = candidate;
        console.log(`[transcode] video encoder: ${candidate.name}`);
        return candidate;
      }
      failedEncoders.add(candidate.name);
    }
  } catch {
    /* fall through */
  }

  cachedVideoEncoder = softwareVideoEncoder();
  console.log("[transcode] video encoder: libx264 (software)");
  return cachedVideoEncoder;
}

function buildEncodeVideoArgs(
  encoder: VideoEncoder,
  targetFps: number | null
): string[] {
  const fpsArgs =
    encoder.name === "libx264"
      ? [
          "-fps_mode",
          "cfr",
          ...(targetFps ? ["-r", targetFps.toFixed(3)] : []),
          "-g",
          "60",
          "-keyint_min",
          "60",
          "-sc_threshold",
          "0",
        ]
      : targetFps
        ? ["-r", targetFps.toFixed(3)]
        : [];
  return [...encoder.encodeArgs, ...fpsArgs];
}

function runFfmpeg(
  args: string[],
  timeoutMs: number,
  onProgress?: (processedSeconds: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-hide_banner", "-nostats", "-progress", "pipe:1", ...args],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );

    let stderr = "";
    let stdoutBuf = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(
        new Error(`ffmpeg timed out after ${Math.round(timeoutMs / 60_000)} min`)
      );
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() || "";
      for (const line of lines) {
        const match = /^out_time_ms=(\d+)$/.exec(line.trim());
        if (match && onProgress) {
          onProgress(Number(match[1]) / 1_000_000);
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

function buildAudioEncodeArgs(): string[] {
  return [
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-b:a",
    "192k",
    "-aac_coder",
    "fast",
  ];
}

function remuxTailArgs(output: string): string[] {
  return [
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "1024",
    output,
  ];
}

function remuxHeadArgs(input: string): string[] {
  return [
    "-loglevel",
    "error",
    "-fflags",
    "+genpts",
    "-y",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
  ];
}

async function runRemux(
  input: string,
  output: string,
  onProgress?: (processedSeconds: number) => void
): Promise<void> {
  const timeout =
    fs.statSync(input).size > 800_000_000 ? 3_600_000 : 1_800_000;
  const probe = getVideoProbe(input);
  const audio = probeAudioStreamSync(input);
  const targetFps = probe?.avgFrameRate ?? probe?.rFrameRate ?? null;
  const canCopyVideo =
    !probe ||
    (COPY_SAFE_VIDEO_CODECS.has(probe.codec) && !needsPlaybackEncode(probe));
  const head = remuxHeadArgs(input);
  const tail = remuxTailArgs(output);

  if (canCopyVideo) {
    try {
      await runFfmpeg(
        [...head, "-c:v", "copy", "-c:a", "copy", ...tail],
        timeout,
        onProgress
      );
      console.log(`[transcode] fast remux (copy all): ${path.basename(input)}`);
      return;
    } catch (err) {
      safeUnlink(output);
      const msg = err instanceof Error ? err.message.slice(0, 300) : String(err);
      console.warn(
        `[transcode] copy-all failed for ${path.basename(input)}, trying copy video + AAC: ${msg}`
      );
    }

    try {
      await runFfmpeg(
        [...head, "-c:v", "copy", ...buildAudioEncodeArgs(), ...tail],
        timeout,
        onProgress
      );
      console.log(
        `[transcode] remux (copy video + AAC audio): ${path.basename(input)}`
      );
      return;
    } catch (err) {
      safeUnlink(output);
      const msg = err instanceof Error ? err.message.slice(0, 300) : String(err);
      console.warn(
        `[transcode] copy video + AAC failed for ${path.basename(input)}, full encode: ${msg}`
      );
    }
  }

  let encoder = detectVideoEncoder();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await runFfmpeg(
        [
          "-loglevel",
          "error",
          "-fflags",
          "+genpts",
          "-y",
          ...encoder.inputArgs,
          "-i",
          input,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          ...buildEncodeVideoArgs(encoder, targetFps),
          ...(audio?.codec === "aac" && audio.channels <= 2
            ? ["-c:a", "copy"]
            : buildAudioEncodeArgs()),
          ...tail,
        ],
        7_200_000,
        onProgress
      );
      console.log(
        `[transcode] full encode (${encoder.name}): ${path.basename(input)}`
      );
      return;
    } catch (err) {
      safeUnlink(output);
      if (encoder.name === "libx264") throw err;
      console.warn(
        `[transcode] ${encoder.name} failed, falling back:`,
        err instanceof Error ? err.message.slice(0, 200) : err
      );
      invalidateVideoEncoder(encoder.name);
      encoder = detectVideoEncoder();
    }
  }
}

async function tryAdoptPartFile(
  filePath: string,
  tmp: string,
  out: string
): Promise<string | null> {
  if (!fs.existsSync(tmp) || activeOutputs.has(tmp)) return null;
  if (!cacheValid(filePath, tmp)) return null;

  activeOutputs.add(tmp);
  try {
    await finalizePartFile(tmp, out);
    registerCache(filePath, out);
    lastErrors.delete(filePath);
    const sourceDuration = getSourceDuration(filePath);
    if (sourceDuration) {
      progress.set(filePath, {
        percent: 100,
        sourceDuration,
        processedSeconds: sourceDuration,
        etaSeconds: 0,
      });
    }
    return out;
  } finally {
    activeOutputs.delete(tmp);
  }
}

async function generatePlayback(filePath: string): Promise<string> {
  const existing = findValidCache(filePath);
  if (existing) return existing;

  const out = cachePath(filePath);
  const hash = cacheHash(filePath);
  const tmp = path.join(TRANSCODE_DIR, `${hash}.part.mp4`);

  await acquire();
  try {
    const ready = findValidCache(filePath);
    if (ready) return ready;

    const adopted = await tryAdoptPartFile(filePath, tmp, out);
    if (adopted) return adopted;

    cleanupStaleParts();

    if (fs.existsSync(tmp) && !activeOutputs.has(tmp)) {
      safeUnlink(tmp);
    }
    activeOutputs.add(tmp);

    const sourceDuration = getSourceDuration(filePath, true);
    const startedAt = Date.now();
    if (sourceDuration) {
      progress.set(filePath, {
        percent: 0,
        sourceDuration,
        processedSeconds: 0,
        etaSeconds: null,
      });
    }

    let remuxDone = false;
    try {
      await runRemux(filePath, tmp, (processedSeconds) => {
        if (!sourceDuration) return;
        setProgress(filePath, sourceDuration, processedSeconds, startedAt);
      });
      remuxDone = true;

      if (!cacheValid(filePath, tmp)) {
        throw new Error(
          "Transcode finished but output duration did not match source"
        );
      }

      if (sourceDuration) {
        progress.set(filePath, {
          percent: 100,
          sourceDuration,
          processedSeconds: sourceDuration,
          etaSeconds: 0,
        });
      }

      await finalizePartFile(tmp, out);
      activeOutputs.delete(tmp);
      registerCache(filePath, out);
      lastErrors.delete(filePath);
      return out;
    } catch (err) {
      activeOutputs.delete(tmp);
      if (!remuxDone || !cacheValid(filePath, tmp)) {
        safeUnlink(tmp);
        progress.delete(filePath);
      }
      throw err;
    }
  } finally {
    release();
  }
}

/** Path to stream — remuxes MKV/WebM to MP4 for iPad/Safari. */
export function getOrCreatePlaybackFile(filePath: string): Promise<string> {
  if (!needsPlaybackCache(filePath)) {
    return Promise.resolve(filePath);
  }

  const cached = findValidCache(filePath);
  if (cached) {
    lastErrors.delete(filePath);
    return Promise.resolve(cached);
  }

  const pending = inFlight.get(filePath);
  if (pending) return pending;

  const prevError = lastErrors.get(filePath);
  if (prevError) {
    const hash = cacheHash(filePath);
    const tmp = path.join(TRANSCODE_DIR, `${hash}.part.mp4`);
    const canAdopt =
      fs.existsSync(tmp) &&
      !activeOutputs.has(tmp) &&
      cacheValid(filePath, tmp);
    if (!canAdopt) {
      const lastKick = lastKickAt.get(filePath) ?? 0;
      if (Date.now() - lastKick < KICK_COOLDOWN_MS) {
        return Promise.reject(new Error(prevError));
      }
    }
  }
  lastKickAt.set(filePath, Date.now());

  const promise = generatePlayback(filePath)
    .catch((err) => {
      const message =
        err instanceof Error ? err.message : "Transcode failed";
      lastErrors.set(filePath, message);
      progress.delete(filePath);
      console.error(`[transcode] ${path.basename(filePath)}: ${message}`);
      throw err;
    })
    .finally(() => {
      inFlight.delete(filePath);
    });
  inFlight.set(filePath, promise);
  return promise;
}

export function playbackReady(filePath: string): boolean {
  if (!needsPlaybackCache(filePath)) return true;
  return findValidCache(filePath) !== null;
}

export {
  getOrCreateHlsPlaylist,
  hlsPlaybackReady,
  isHlsInFlight,
  resolveHlsDir,
} from "@/serve/hls-manager";

export function isTranscodeInFlight(filePath: string): boolean {
  return inFlight.has(filePath);
}

export function getTranscodeError(filePath: string): string | null {
  if (playbackReady(filePath)) return null;
  if (isTranscodeInFlight(filePath)) return null;
  return lastErrors.get(filePath) ?? null;
}

export function clearTranscodeError(filePath: string): void {
  lastErrors.delete(filePath);
}

export function getTranscodeProgress(
  filePath: string
): TranscodeProgress | null {
  return progress.get(filePath) ?? null;
}

export function getVideoDuration(filePath: string): number | null {
  return getVideoDurationFast(filePath) ?? sourceDurations.get(filePath) ?? null;
}
