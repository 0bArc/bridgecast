export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Route iPad hardware volume keys to media playback (WebKit Audio Session). */
export function activateIosPlaybackAudio(): void {
  if (!isIosDevice()) return;
  try {
    const nav = navigator as Navigator & {
      audioSession?: { type: string };
    };
    if (nav.audioSession) {
      nav.audioSession.type = "playback";
    }
  } catch {
    /* unsupported */
  }
}

export function setIosMediaSession(title: string, playing: boolean): void {
  if (!isIosDevice() || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  } catch {
    /* unsupported */
  }
}

type WebKitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export function toggleIosVideoFullscreen(video: HTMLVideoElement): boolean {
  if (!isIosDevice()) return false;
  const v = video as WebKitVideo;
  if (v.webkitDisplayingFullscreen) {
    v.webkitExitFullscreen?.();
    return true;
  }
  v.webkitEnterFullscreen?.();
  return true;
}

export function isIosVideoFullscreen(video: HTMLVideoElement): boolean {
  return Boolean((video as WebKitVideo).webkitDisplayingFullscreen);
}