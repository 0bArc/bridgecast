import { hlsManager } from "@/serve/hls-manager";
import {
  ensureTranscodeStartup,
  getOrCreatePlaybackFile,
  getTranscodeError,
  getTranscodeProgress,
  isMp4TranscodeInFlight,
  needsRemux,
  needsPlaybackCache,
  playbackReady,
} from "@/serve/transcode";

export type PlaybackStatus = {
  ready: boolean;
  hlsReady: boolean;
  needsRemux: boolean;
  preparing: boolean;
  hlsPackaging: boolean;
  viewers: number;
  error: string | null;
  progress: number | null;
  sourceDuration: number | null;
  processedSeconds: number | null;
  etaSeconds: number | null;
};

/** Read transcode/HLS state and kick off background work if needed. */
export function getPlaybackStatus(filePath: string): PlaybackStatus {
  ensureTranscodeStartup();
  const ready = playbackReady(filePath);
  const remux = needsPlaybackCache(filePath);
  const mp4Busy = isMp4TranscodeInFlight(filePath);
  const hlsStatus = hlsManager.getStatus(filePath);
  const inFlight = mp4Busy || (ready && (hlsStatus.preparing || hlsStatus.packaging));
  const transcodeError = getTranscodeError(filePath);

  if (!ready && remux && !mp4Busy) {
    void getOrCreatePlaybackFile(filePath).catch(() => undefined);
  }

  if (ready && remux && !hlsStatus.ready && !hlsStatus.preparing) {
    hlsManager.prepareBackground(filePath);
  }

  const prog = getTranscodeProgress(filePath);
  const sourceDuration = prog?.sourceDuration ?? null;

  return {
    ready,
    hlsReady: hlsStatus.ready,
    needsRemux: remux,
    preparing: inFlight,
    hlsPackaging: hlsStatus.packaging,
    viewers: hlsStatus.viewers,
    error: transcodeError,
    progress: prog?.percent ?? (inFlight ? 0 : null),
    sourceDuration,
    processedSeconds: prog?.processedSeconds ?? null,
    etaSeconds: prog?.etaSeconds ?? null,
  };
}
