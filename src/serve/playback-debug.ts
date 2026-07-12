import fs from "fs";
import path from "path";
import { listHlsInventory } from "@/serve/hls";
import { hlsManager, resolveHlsDir } from "@/serve/hls-manager";
import {
  findCachedMp4,
  getTranscodeDir,
  isMp4TranscodeInFlight,
  videoSourceKey,
} from "@/serve/transcode";

export type PlaybackDebugEventKind =
  | "hls-playlist"
  | "hls-segment"
  | "hls-init"
  | "mp4-range"
  | "mp4-full"
  | "cleanup"
  | "hls-packaging-start"
  | "hls-packaging-done"
  | "hls-packaging-error"
  | "hls-rebuild";

type PlaybackDebugEvent = {
  at: number;
  kind: PlaybackDebugEventKind;
  detail: string;
  sourceKey?: string;
};

type SegmentServe = {
  file: string;
  at: number;
  range: string | null;
  bytes?: number;
};

const MAX_GLOBAL_EVENTS = 100;
const MAX_SEGMENT_HISTORY = 24;

const globalEvents: PlaybackDebugEvent[] = [];
const segmentHistory = new Map<string, SegmentServe[]>();
const lastSegment = new Map<string, SegmentServe>();

function trimGlobal() {
  if (globalEvents.length > MAX_GLOBAL_EVENTS) {
    globalEvents.length = MAX_GLOBAL_EVENTS;
  }
}

export function logPlaybackDebug(
  kind: PlaybackDebugEventKind,
  detail: string,
  filePath?: string
): void {
  const sourceKey = filePath ? videoSourceKey(filePath) : undefined;
  globalEvents.unshift({ at: Date.now(), kind, detail, sourceKey });
  trimGlobal();
}

export function logHlsAssetServe(
  filePath: string,
  assetFile: string,
  range: string | null,
  bytes?: number
): void {
  const key = videoSourceKey(filePath);
  const safe = path.basename(assetFile);
  const kind: PlaybackDebugEventKind = safe.endsWith(".m3u8")
    ? "hls-playlist"
    : safe.endsWith(".m4s")
      ? "hls-segment"
      : safe.endsWith(".mp4")
        ? "hls-init"
        : "hls-segment";

  const entry: SegmentServe = {
    file: safe,
    at: Date.now(),
    range,
    bytes,
  };

  lastSegment.set(key, entry);

  if (kind === "hls-segment" || kind === "hls-init") {
    const history = segmentHistory.get(key) ?? [];
    history.unshift(entry);
    if (history.length > MAX_SEGMENT_HISTORY) history.length = MAX_SEGMENT_HISTORY;
    segmentHistory.set(key, history);
  }

  const rangeLabel = range ? ` range ${range}` : "";
  const byteLabel = bytes !== undefined ? ` ${bytes} B` : "";
  logPlaybackDebug(
    kind,
    `${safe}${rangeLabel}${byteLabel}`,
    filePath
  );
}

export function logMp4Serve(
  filePath: string,
  streamPath: string,
  range: string | null
): void {
  logPlaybackDebug(
    range ? "mp4-range" : "mp4-full",
    `${path.basename(streamPath)}${range ? ` ${range}` : " (full)"}`,
    filePath
  );
}

export function logCleanup(detail: string): void {
  logPlaybackDebug("cleanup", detail);
}

export type PlaybackDebugSnapshot = {
  at: number;
  sourceKey: string;
  hlsInventory: ReturnType<typeof listHlsInventory>;
  lastSegment: SegmentServe | null;
  segmentHistory: SegmentServe[];
  recentEvents: PlaybackDebugEvent[];
  cleanupEvents: PlaybackDebugEvent[];
  hlsStatus: ReturnType<typeof hlsManager.getStatus>;
  mp4TranscodeInFlight: boolean;
  cachedMp4: string | null;
  hlsDir: string | null;
  transcodeDir: string;
};

export function getPlaybackDebugSnapshot(filePath: string): PlaybackDebugSnapshot {
  const key = videoSourceKey(filePath);
  const hlsDir = resolveHlsDir(filePath);

  const recentEvents = globalEvents
    .filter((e) => !e.sourceKey || e.sourceKey === key)
    .slice(0, 30);

  const cleanupEvents = globalEvents
    .filter((e) => e.kind === "cleanup")
    .slice(0, 15);

  return {
    at: Date.now(),
    sourceKey: key,
    hlsInventory: hlsDir ? listHlsInventory(hlsDir) : null,
    lastSegment: lastSegment.get(key) ?? null,
    segmentHistory: segmentHistory.get(key) ?? [],
    recentEvents,
    cleanupEvents,
    hlsStatus: hlsManager.getStatus(filePath),
    mp4TranscodeInFlight: isMp4TranscodeInFlight(filePath),
    cachedMp4: findCachedMp4(filePath),
    hlsDir,
    transcodeDir: getTranscodeDir(),
  };
}

export function getGlobalDebugTail(limit = 20): PlaybackDebugEvent[] {
  return globalEvents.slice(0, limit);
}
