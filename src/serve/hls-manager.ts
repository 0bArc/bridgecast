import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import {
  cleanupStrayHlsArtifacts,
  generateHlsFromMp4,
  hlsCacheValid,
  readHlsAssetText,
  removeHlsDir,
  rewriteHlsPlaylist,
} from "@/serve/hls";
import {
  clearManifestHlsForFile,
  evictExpiredHlsCaches,
  findCachedMp4,
  getManifestEntry,
  getTranscodeDir,
  HLS_CACHE_VERSION,
  isIpadNative,
  needsRemux,
  touchManifestHlsAccess,
  updateManifestHlsEntry,
  videoCacheHash,
  videoSourceKey,
} from "@/serve/transcode";

export { HLS_CACHE_VERSION } from "@/serve/transcode";

const MAX_HLS_PACKAGING = 1;
const VIEWER_TTL_MS = 45_000;

export type HlsStatus = {
  ready: boolean;
  preparing: boolean;
  viewers: number;
  packaging: boolean;
};

type ViewerEntry = {
  count: number;
  lastSeen: number;
};

function runFfmpeg(
  args: string[],
  timeoutMs: number,
  cwd?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      cwd,
    });

    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`ffmpeg HLS timed out after ${Math.round(timeoutMs / 60_000)} min`));
    }, timeoutMs);

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
      reject(new Error(stderr.trim() || `ffmpeg HLS exited with code ${code}`));
    });
  });
}

class HlsManager {
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly playlistCache = new Map<string, string>();
  private readonly viewers = new Map<string, ViewerEntry>();
  private packaging = 0;
  private readonly packagingQueue: Array<() => void> = [];

  private key(filePath: string): string {
    return videoSourceKey(filePath);
  }

  private hlsDirPath(filePath: string): string {
    return path.join(getTranscodeDir(), videoCacheHash(filePath));
  }

  private acquirePackaging(): Promise<void> {
    return new Promise((resolve) => {
      const start = () => {
        this.packaging++;
        resolve();
      };
      if (this.packaging < MAX_HLS_PACKAGING) start();
      else this.packagingQueue.push(start);
    });
  }

  private releasePackaging(): void {
    this.packaging--;
    const next = this.packagingQueue.shift();
    if (next) next();
  }

  private pruneViewersOnly(): void {
    const cutoff = Date.now() - VIEWER_TTL_MS;
    for (const [key, entry] of this.viewers) {
      if (entry.lastSeen < cutoff) this.viewers.delete(key);
    }
  }

  private hasViewersByKey(key: string): boolean {
    return (this.viewers.get(key)?.count ?? 0) > 0;
  }

  private isPreparingByKey(key: string): boolean {
    return this.inFlight.has(key);
  }

  evictIdleHlsCaches(): number {
    const removed = evictExpiredHlsCaches(
      (key) => this.hasViewersByKey(key),
      (key) => this.isPreparingByKey(key)
    );
    if (removed > 0) this.playlistCache.clear();
    return removed;
  }

  private pruneViewers(): void {
    this.pruneViewersOnly();
    this.evictIdleHlsCaches();
  }

  resolveDir(filePath: string): string | null {
    if (!needsRemux(filePath) || isIpadNative(filePath)) return null;

    const expected = this.hlsDirPath(filePath);
    const dirName = path.basename(expected);
    const entry = getManifestEntry(filePath);

    if (
      entry?.hlsVersion !== undefined &&
      entry.hlsVersion !== HLS_CACHE_VERSION
    ) {
      removeHlsDir(expected);
      clearManifestHlsForFile(filePath);
    } else if (hlsCacheValid(expected)) {
      if (!entry?.hlsDir) {
        const mp4 = findCachedMp4(filePath);
        if (mp4) {
          updateManifestHlsEntry(filePath, path.basename(mp4), dirName);
        }
      }
      return expected;
    }

    const mp4 = findCachedMp4(filePath);
    if (!mp4) return null;

    if (hlsCacheValid(expected)) {
      updateManifestHlsEntry(filePath, path.basename(mp4), dirName);
      return expected;
    }

    return null;
  }

  isReady(filePath: string): boolean {
    if (!needsRemux(filePath) || isIpadNative(filePath)) return true;
    return this.resolveDir(filePath) !== null;
  }

  isPreparing(filePath: string): boolean {
    return this.inFlight.has(this.key(filePath));
  }

  isPackaging(): boolean {
    return this.packaging > 0;
  }

  registerViewer(filePath: string): void {
    this.pruneViewers();
    const key = this.key(filePath);
    const entry = this.viewers.get(key) ?? { count: 0, lastSeen: 0 };
    entry.count++;
    entry.lastSeen = Date.now();
    this.viewers.set(key, entry);
    touchManifestHlsAccess(filePath);
  }

  touchViewer(filePath: string): void {
    this.pruneViewers();
    const key = this.key(filePath);
    const entry = this.viewers.get(key);
    if (entry) entry.lastSeen = Date.now();
    touchManifestHlsAccess(filePath);
  }

  getViewerCount(filePath: string): number {
    this.pruneViewers();
    return this.viewers.get(this.key(filePath))?.count ?? 0;
  }

  getStatus(filePath: string): HlsStatus {
    return {
      ready: this.isReady(filePath),
      preparing: this.isPreparing(filePath),
      viewers: this.getViewerCount(filePath),
      packaging: this.isPackaging(),
    };
  }

  prepareBackground(filePath: string): void {
    if (!needsRemux(filePath) || isIpadNative(filePath)) return;
    if (this.isReady(filePath) || this.isPreparing(filePath)) return;
    void this.prepare(filePath).catch(() => undefined);
  }

  async prepare(filePath: string): Promise<string> {
    if (!needsRemux(filePath) || isIpadNative(filePath)) {
      throw new Error("HLS not used for this file");
    }

    const cached = this.resolveDir(filePath);
    if (cached) return cached;

    const key = this.key(filePath);
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.buildHls(filePath).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async buildHls(filePath: string): Promise<string> {
    const ready = this.resolveDir(filePath);
    if (ready) return ready;

    const { getOrCreatePlaybackFile } = await import("@/serve/transcode");
    const mp4 = await getOrCreatePlaybackFile(filePath);
    const hlsDir = this.hlsDirPath(filePath);

    await this.acquirePackaging();
    try {
      const stillReady = this.resolveDir(filePath);
      if (stillReady) return stillReady;

      await generateHlsFromMp4(mp4, hlsDir, runFfmpeg);
      updateManifestHlsEntry(filePath, path.basename(mp4), path.basename(hlsDir));
      this.playlistCache.delete(this.key(filePath));
      touchManifestHlsAccess(filePath);

      if (!hlsCacheValid(hlsDir)) {
        throw new Error("HLS packaging finished but cache is invalid");
      }
      return hlsDir;
    } finally {
      this.releasePackaging();
    }
  }

  async ensureAfterMp4(filePath: string, mp4Path: string): Promise<string> {
    const existing = this.resolveDir(filePath);
    if (existing) return existing;
    return this.prepare(filePath);
  }

  getPlaylistContent(filePath: string, baseUrl: string): string | null {
    const hlsDir = this.resolveDir(filePath);
    if (!hlsDir) return null;

    const cacheKey = `${this.key(filePath)}|${baseUrl}`;
    const cached = this.playlistCache.get(cacheKey);
    if (cached) return cached;

    const raw = readHlsAssetText(hlsDir, "playlist.m3u8");
    if (!raw) return null;

    const rewritten = rewriteHlsPlaylist(raw, baseUrl);
    this.playlistCache.set(cacheKey, rewritten);
    return rewritten;
  }

  invalidatePlaylistCache(filePath: string): void {
    const prefix = `${this.key(filePath)}|`;
    for (const key of this.playlistCache.keys()) {
      if (key.startsWith(prefix)) this.playlistCache.delete(key);
    }
  }
}

export const hlsManager = new HlsManager();

let startupDone = false;

/** Deferred so dev HMR does not run fs cleanup on every hot reload. */
export function ensureHlsStartup(): void {
  if (startupDone) return;
  startupDone = true;
  cleanupStrayHlsArtifacts(process.cwd());
  hlsManager.evictIdleHlsCaches();
}

export function hlsPlaybackReady(filePath: string): boolean {
  return hlsManager.isReady(filePath);
}

export function resolveHlsDir(filePath: string): string | null {
  return hlsManager.resolveDir(filePath);
}

export function getOrCreateHlsPlaylist(filePath: string): Promise<string> {
  return hlsManager.prepare(filePath);
}

export function isHlsInFlight(filePath: string): boolean {
  return hlsManager.isPreparing(filePath);
}
