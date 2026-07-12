"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  activateIosPlaybackAudio,
  isIosDevice,
  setIosMediaSession,
  toggleIosVideoFullscreen,
} from "@/lib/client-device";
import { findActiveCue, parseSrt, cuesToVtt, applySubtitleOffset, type SubtitleCue } from "@/lib/srt";
import { SubtitlePanel, type SubtitleTrack } from "@/components/subtitle-panel";

type Props = {
  src: string;
  hlsSrc?: string;
  statusSrc: string;
  title: string;
  needsPrepare?: boolean;
  mimeType?: string;
  subtitlesApi?: string;
  /** ffprobe duration when browser metadata is slow (large remux files). */
  expectedDuration?: number | null;
  /** GET/PUT resume position for this title. */
  progressApi?: string;
  /** Server-known resume point (avoids client fetch race before video loads). */
  initialResumeAt?: number | null;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  hlsSrc = "",
  statusSrc,
  title,
  needsPrepare = false,
  mimeType,
  subtitlesApi,
  expectedDuration = null,
  progressApi,
  initialResumeAt = null,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const isIos = mounted && isIosDevice();
  const [hlsReadyState, setHlsReadyState] = useState(false);
  const preferHlsPlayback = isIos && !!hlsSrc && hlsReadyState;
  const playbackSrc = preferHlsPlayback ? hlsSrc : src;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [preparing, setPreparing] = useState(needsPrepare);
  const [packagingHls, setPackagingHls] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [sourceDuration, setSourceDuration] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [videoSrc, setVideoSrc] = useState("");
  const [subtitleOpen, setSubtitleOpen] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [activeCueText, setActiveCueText] = useState("");
  const [iosNativeFs, setIosNativeFs] = useState(false);
  const [nativeTrackVtts, setNativeTrackVtts] = useState<Record<string, string>>({});
  const [seekFlash, setSeekFlash] = useState<"-10" | "+10" | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubtitleRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number } | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchHandledRef = useRef(false);
  const nativeVttUrlsRef = useRef<string[]>([]);
  const lastSavedAtRef = useRef(0);
  const resumeAppliedRef = useRef(false);
  const pendingPositionRef = useRef<number | null>(null);
  const pendingTimeRef = useRef(0);
  const timeRafRef = useRef<number | null>(null);
  const transcodeStartedAtRef = useRef<number | null>(null);

  const syncDuration = useCallback((v: HTMLVideoElement) => {
    const d = v.duration;
    if (Number.isFinite(d) && d > 0) {
      setDuration(d);
    }
  }, []);

  const applyResumePosition = useCallback((v: HTMLVideoElement) => {
    const pending = pendingPositionRef.current;
    if (pending === null || pending < 5 || resumeAppliedRef.current) return;
    if (Math.abs(v.currentTime - pending) <= 1.5) {
      resumeAppliedRef.current = true;
      setCurrent(v.currentTime);
      return;
    }
    try {
      v.currentTime = pending;
      setCurrent(pending);
    } catch {
      /* HLS not seekable yet */
    }
  }, []);

  const seedResumePosition = useCallback((position: number | null | undefined) => {
    if (typeof position !== "number" || !Number.isFinite(position) || position < 5) {
      return;
    }
    pendingPositionRef.current = position;
    resumeAppliedRef.current = false;
    setCurrent(position);
  }, []);

  const scheduleCurrentTime = useCallback((time: number) => {
    pendingTimeRef.current = time;
    if (timeRafRef.current !== null) return;
    timeRafRef.current = requestAnimationFrame(() => {
      timeRafRef.current = null;
      setCurrent(pendingTimeRef.current);
    });
  }, []);

  const seekMax =
    duration > 0
      ? duration
      : expectedDuration && expectedDuration > 0
        ? expectedDuration
        : 0;
  const CONTROLS_HIDE_MS = 10_000;
  const DOUBLE_TAP_MS = 320;
  const SEEK_ZONE = 0.38;

  const scheduleHideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (subtitleOpen) return;
    hideTimer.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_MS);
  }, [subtitleOpen]);

  const bumpControls = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      if (timeRafRef.current !== null) cancelAnimationFrame(timeRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!playing || subtitleOpen) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (!playing) setShowControls(true);
      return;
    }
    scheduleHideControls();
  }, [playing, subtitleOpen, scheduleHideControls]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const shouldWait = !!statusSrc;
    if (!shouldWait) {
      setVideoSrc(src);
      setPreparing(false);
      setPackagingHls(false);
      return;
    }

    let cancelled = false;
    setPreparing(true);
    setError("");
    setVideoSrc("");

    async function waitForReady() {
      const waitStarted = Date.now();
      let delayMs = 1500;
      let lastProgress = -1;
      let lastProgressAt = Date.now();

      while (!cancelled) {
        try {
          const res = await fetch(statusSrc, { credentials: "include" });
          if (res.ok) {
            const data = (await res.json()) as {
              ready?: boolean;
              hlsReady?: boolean;
              preparing?: boolean;
              hlsPackaging?: boolean;
              error?: string;
              progress?: number | null;
              sourceDuration?: number | null;
              etaSeconds?: number | null;
            };

            const mp4Ready = Boolean(data.ready);
            const hlsReady = Boolean(data.hlsReady);
            const iosWaitingHls =
              isIos && !!hlsSrc && mp4Ready && !hlsReady;

            setHlsReadyState(hlsReady);
            setPackagingHls(iosWaitingHls);

            if (mp4Ready) {
              setVideoSrc(isIos && hlsSrc && hlsReady ? hlsSrc : src);
              setPreparing(false);
              setPrepareProgress(100);
              setError("");

              if (!iosWaitingHls) {
                return;
              }

              delayMs = 2500;
            } else {
              if (data.error && !data.preparing) {
                setPreparing(false);
                setError(data.error);
                return;
              }

              setPreparing(true);
              setError("");

              if (typeof data.progress === "number") {
                setPrepareProgress(data.progress);
                if (data.progress > 0 && !transcodeStartedAtRef.current) {
                  transcodeStartedAtRef.current = Date.now();
                }
                if (data.progress !== lastProgress) {
                  lastProgress = data.progress;
                  lastProgressAt = Date.now();
                }
              }

              if (typeof data.sourceDuration === "number") {
                setSourceDuration(data.sourceDuration);
              }

              if (typeof data.etaSeconds === "number") {
                setEtaSeconds(data.etaSeconds);
              } else if (
                data.preparing &&
                transcodeStartedAtRef.current &&
                typeof data.progress === "number" &&
                data.progress > 0
              ) {
                const elapsed =
                  (Date.now() - transcodeStartedAtRef.current) / 1000;
                setEtaSeconds(
                  Math.round((elapsed / data.progress) * (100 - data.progress))
                );
              } else if (!data.preparing) {
                setEtaSeconds(null);
                transcodeStartedAtRef.current = null;
              }

              const maxWaitMs = Math.max(
                7_200_000,
                ((data.sourceDuration ?? 7200) + 600) * 1000
              );
              const stalledMs = Date.now() - lastProgressAt;
              if (Date.now() - waitStarted > maxWaitMs) {
                setPreparing(false);
                setError(
                  "Video preparation timed out. Try again or check server logs."
                );
                return;
              }
              if (
                data.preparing &&
                typeof data.progress === "number" &&
                data.progress > 0 &&
                stalledMs > 600_000
              ) {
                setPreparing(false);
                setError("Transcode stalled. Restart server and try again.");
                return;
              }

              delayMs = data.preparing ? 2500 : 5000;
            }
          }
        } catch {
          delayMs = 3000;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    void waitForReady();
    return () => {
      cancelled = true;
    };
  }, [mounted, statusSrc, isIos, hlsSrc, src]);

  const saveProgress = useCallback(
    async (position: number, durationValue: number | null, clear = false) => {
      if (!progressApi) return;
      try {
        await fetch(progressApi, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position,
            duration: durationValue,
            clear,
          }),
          keepalive: true,
        });
      } catch {
        /* offline */
      }
    },
    [progressApi]
  );

  useEffect(() => {
    seedResumePosition(initialResumeAt);
  }, [initialResumeAt, seedResumePosition]);

  useEffect(() => {
    if (!progressApi || !videoSrc || preparing) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(progressApi, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { position?: number | null };
        if (
          cancelled ||
          typeof data.position !== "number" ||
          !Number.isFinite(data.position) ||
          data.position < 5
        ) {
          return;
        }
        seedResumePosition(data.position);
        const v = videoRef.current;
        if (v) applyResumePosition(v);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [progressApi, videoSrc, preparing, seedResumePosition, applyResumePosition]);

  useEffect(() => {
    if (!videoSrc || preparing) return;
    resumeAppliedRef.current = false;
  }, [videoSrc, preparing]);

  useEffect(() => {
    if (!progressApi) return;

    const flush = () => {
      const v = videoRef.current;
      if (!v || preparing || !videoSrc) return;
      const pos = v.currentTime;
      const dur =
        Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seekMax;
      void saveProgress(pos, dur > 0 ? dur : null, v.ended);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [progressApi, preparing, videoSrc, seekMax, saveProgress]);

  const loadSubtitleTracks = useCallback(async () => {
    if (!subtitlesApi) return;
    const res = await fetch(subtitlesApi, { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { tracks?: SubtitleTrack[] };
    setSubtitleTracks(data.tracks ?? []);
  }, [subtitlesApi]);

  useEffect(() => {
    if (!subtitlesApi || !videoSrc || preparing || subtitleOpen) return;
    void loadSubtitleTracks();
  }, [subtitlesApi, videoSrc, preparing, subtitleOpen, loadSubtitleTracks]);

  const loadSubtitleTrack = useCallback(
    async (id: string | null, tracks = subtitleTracks) => {
      setActiveSubtitleId(id);
      if (!id || !subtitlesApi) {
        setSubtitleCues([]);
        setActiveCueText("");
        return;
      }
      const base = subtitlesApi.replace(/\?.*$/, "");
      const q = subtitlesApi.includes("?")
        ? subtitlesApi.slice(subtitlesApi.indexOf("?"))
        : "";
      const res = await fetch(
        `${base}/${encodeURIComponent(id)}${q}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        setSubtitleCues([]);
        setActiveCueText("");
        return;
      }
      const text = await res.text();
      const track = tracks.find((t) => t.id === id);
      setSubtitleCues(
        applySubtitleOffset(parseSrt(text), track?.offset ?? 0)
      );
    },
    [subtitlesApi, subtitleTracks]
  );

  const syncNativeTextTracks = useCallback(
    (nativeActive: boolean, activeId: string | null) => {
      const v = videoRef.current;
      if (!v || !isIos) return;
      const idByLabel = new Map(subtitleTracks.map((t) => [t.label, t.id]));
      for (let i = 0; i < v.textTracks.length; i++) {
        const tt = v.textTracks[i];
        const trackId = idByLabel.get(tt.label);
        if (nativeActive && activeId && trackId === activeId) {
          tt.mode = "showing";
        } else {
          tt.mode = "hidden";
        }
      }
    },
    [isIos, subtitleTracks]
  );

  useEffect(() => {
    if (!isIos || !subtitlesApi || subtitleTracks.length === 0) return;
    let cancelled = false;

    void (async () => {
      const base = subtitlesApi.replace(/\?.*$/, "");
      const q = subtitlesApi.includes("?")
        ? subtitlesApi.slice(subtitlesApi.indexOf("?"))
        : "";
      const next: Record<string, string> = {};

      for (const track of subtitleTracks) {
        try {
          const res = await fetch(
            `${base}/${encodeURIComponent(track.id)}${q}`,
            { credentials: "include" }
          );
          if (!res.ok) continue;
          const text = await res.text();
          const vtt = cuesToVtt(
            applySubtitleOffset(parseSrt(text), track.offset ?? 0)
          );
          next[track.id] = URL.createObjectURL(
            new Blob([vtt], { type: "text/vtt" })
          );
        } catch {
          /* skip broken track */
        }
      }

      if (cancelled) {
        for (const url of Object.values(next)) URL.revokeObjectURL(url);
        return;
      }

      for (const url of nativeVttUrlsRef.current) URL.revokeObjectURL(url);
      nativeVttUrlsRef.current = Object.values(next);
      setNativeTrackVtts(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [isIos, subtitlesApi, subtitleTracks]);

  useEffect(() => {
    syncNativeTextTracks(iosNativeFs, activeSubtitleId);
  }, [iosNativeFs, activeSubtitleId, nativeTrackVtts, syncNativeTextTracks]);

  useEffect(() => {
    return () => {
      for (const url of nativeVttUrlsRef.current) URL.revokeObjectURL(url);
      nativeVttUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (autoSubtitleRef.current || activeSubtitleId || subtitleTracks.length === 0) {
      return;
    }
    autoSubtitleRef.current = true;
    const embedded = subtitleTracks.find((t) => t.embedded);
    void loadSubtitleTrack((embedded ?? subtitleTracks[0]).id, subtitleTracks);
  }, [subtitleTracks, activeSubtitleId, loadSubtitleTrack]);

  async function adjustSubtitleOffset(id: string, delta: number) {
    if (!subtitlesApi) return;
    const track = subtitleTracks.find((t) => t.id === id);
    const next = (track?.offset ?? 0) + delta;
    const res = await fetch(subtitlesApi, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, offset: next }),
    });
    const data = (await res.json()) as { tracks?: SubtitleTrack[] };
    if (res.ok && data.tracks) {
      setSubtitleTracks(data.tracks);
      if (activeSubtitleId === id) {
        await loadSubtitleTrack(id, data.tracks);
      }
    }
  }

  async function calibrateSubtitleTrack(id: string) {
    if (!subtitlesApi) return null;
    const res = await fetch(subtitlesApi, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, calibrate: true }),
    });
    const data = (await res.json()) as {
      tracks?: SubtitleTrack[];
      calibration?: SubtitleTrack["calibration"];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Calibration failed");
    if (data.tracks) setSubtitleTracks(data.tracks);
    if (activeSubtitleId === id) {
      await loadSubtitleTrack(id, data.tracks ?? subtitleTracks);
    }
    return data.calibration ?? null;
  }

  async function uploadSubtitle(file: File) {
    if (!subtitlesApi) throw new Error("Subtitles unavailable");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(subtitlesApi, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = (await res.json()) as {
      error?: string;
      tracks?: SubtitleTrack[];
      track?: SubtitleTrack;
    };
    if (!res.ok) throw new Error(data.error || "Upload failed");
    setSubtitleTracks(data.tracks ?? []);
    if (data.track) await loadSubtitleTrack(data.track.id, data.tracks ?? []);
  }

  async function deleteSubtitle(id: string) {
    if (!subtitlesApi) return;
    const res = await fetch(`${subtitlesApi}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = (await res.json()) as { tracks?: SubtitleTrack[] };
    if (res.ok) setSubtitleTracks(data.tracks ?? []);
    if (activeSubtitleId === id) await loadSubtitleTrack(null);
  }

  const claimIosMedia = useCallback(() => {
    if (!isIos) return;
    activateIosPlaybackAudio();
    setIosMediaSession(title, !videoRef.current?.paused);
  }, [isIos, title]);

  useEffect(() => {
    if (!isIos || !videoSrc) return;
    activateIosPlaybackAudio();
    setIosMediaSession(title, playing);
  }, [isIos, videoSrc, title, playing]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isIos) return;
    const onBegin = () => {
      setIosNativeFs(true);
      claimIosMedia();
      bumpControls();
    };
    const onEnd = () => {
      setIosNativeFs(false);
      bumpControls();
    };
    v.addEventListener("webkitbeginfullscreen", onBegin);
    v.addEventListener("webkitendfullscreen", onEnd);
    return () => {
      v.removeEventListener("webkitbeginfullscreen", onBegin);
      v.removeEventListener("webkitendfullscreen", onEnd);
    };
  }, [isIos, videoSrc, claimIosMedia, bumpControls]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || preparing || error) return;
    if (v.paused) {
      activateIosPlaybackAudio();
      void v.play().catch(() => setError("Playback failed on this device."));
    } else {
      v.pause();
    }
    bumpControls();
  };

  const showSeekHint = (direction: "-10" | "+10") => {
    setSeekFlash(direction);
    if (seekFlashTimer.current) clearTimeout(seekFlashTimer.current);
    seekFlashTimer.current = setTimeout(() => setSeekFlash(null), 700);
  };

  const skip = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max =
      Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seekMax;
    v.currentTime = Math.max(0, Math.min(max || 0, v.currentTime + delta));
    bumpControls();
    showSeekHint(delta < 0 ? "-10" : "+10");
  };

  const handleSurfaceTap = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || preparing || error) return;

    const relX = (clientX - rect.left) / rect.width;
    const now = Date.now();
    const last = lastTapRef.current;

    if (last && now - last.time <= DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTapRef.current = null;

      if (relX < SEEK_ZONE) {
        skip(-10);
        return;
      }
      if (relX > 1 - SEEK_ZONE) {
        skip(10);
        return;
      }
    }

    lastTapRef.current = { time: now, x: relX };
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      lastTapRef.current = null;
      togglePlay();
    }, DOUBLE_TAP_MS);
    bumpControls();
  };

  const setVideoVolume = (next: number) => {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(1, next));
    v.volume = clamped;
    v.muted = clamped === 0;
    setVolume(clamped);
    setMuted(clamped === 0);
    bumpControls();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.muted || v.volume === 0) {
      const restore = volume > 0 ? volume : 1;
      v.muted = false;
      v.volume = restore;
      setVolume(restore);
      setMuted(false);
    } else {
      v.muted = true;
      setMuted(true);
    }
    bumpControls();
  };

  const toggleFullscreen = async () => {
    const v = videoRef.current;
    const el = containerRef.current;
    if (!el) return;
    if (isIos && v && toggleIosVideoFullscreen(v)) {
      bumpControls();
      return;
    }
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
    bumpControls();
  };

  const onSeek = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const max =
      Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seekMax;
    const next = max > 0 ? Math.min(value, max) : value;
    v.currentTime = next;
    setCurrent(next);
    bumpControls();
  };

  const displayVolume = muted ? 0 : volume;

  return (
    <div
      ref={containerRef}
      className="video-player-shell relative flex-1 w-full min-h-0 bg-black rounded-lg overflow-hidden group touch-manipulation"
      onClick={(e) => {
        if (touchHandledRef.current) {
          touchHandledRef.current = false;
          return;
        }
        if (
          e.target !== e.currentTarget &&
          !(e.target as HTMLElement).closest(".video-player-media")
        ) {
          return;
        }
        handleSurfaceTap(e.clientX);
      }}
      onTouchEnd={(e) => {
        if (subtitleOpen) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        touchHandledRef.current = true;
        handleSurfaceTap(touch.clientX);
      }}
    >
      {preparing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black z-10 px-6">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-white/80 text-center">
            {packagingHls
              ? "Packaging HLS for iPad… keep this page open."
              : needsPrepare
                ? "Converting for iPad… keep this page open."
                : "Preparing stream…"}
          </p>
          <div className="w-full max-w-md space-y-2">
            <progress
              className="progress progress-primary w-full"
              value={prepareProgress}
              max={100}
            />
            <div className="flex justify-between text-xs text-white/60 tabular-nums">
              <span>{prepareProgress}%</span>
              {sourceDuration ? (
                <span>Length {formatTime(sourceDuration)}</span>
              ) : null}
            </div>
            {etaSeconds !== null && etaSeconds > 0 ? (
              <p className="text-xs text-white/50 text-center tabular-nums">
                Est. time left ~{formatTime(etaSeconds)}
              </p>
            ) : (
              <p className="text-xs text-white/50 text-center">
                Estimating time…
              </p>
            )}
          </div>
        </div>
      ) : null}

      {packagingHls && !preparing ? (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full glass-panel text-xs text-white/75 pointer-events-none">
          Optimizing stream for iPad…
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
          <p className="text-sm text-error text-center">{error}</p>
        </div>
      ) : null}

      {videoSrc ? (
        <video
          ref={videoRef}
          key={videoSrc}
          className="video-player-media absolute inset-0 h-full w-full object-contain"
          playsInline
          preload="auto"
          controls={false}
          onPlay={() => {
            setPlaying(true);
            claimIosMedia();
            bumpControls();
          }}
          onPause={() => {
            setPlaying(false);
            setIosMediaSession(title, false);
            setShowControls(true);
            const v = videoRef.current;
            if (v && progressApi && !preparing) {
              const dur =
                Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seekMax;
              void saveProgress(v.currentTime, dur > 0 ? dur : null);
            }
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            scheduleCurrentTime(v.currentTime);
            syncDuration(v);
            if (
              !resumeAppliedRef.current &&
              pendingPositionRef.current !== null &&
              Math.abs(v.currentTime - pendingPositionRef.current) <= 1.5
            ) {
              resumeAppliedRef.current = true;
            }
            if (subtitleCues.length > 0) {
              const cue = findActiveCue(subtitleCues, v.currentTime);
              setActiveCueText(cue?.text ?? "");
            }
            if (!progressApi || preparing) return;
            const now = Date.now();
            if (now - lastSavedAtRef.current < 10_000) return;
            lastSavedAtRef.current = now;
            const dur =
              Number.isFinite(v.duration) && v.duration > 0 ? v.duration : seekMax;
            void saveProgress(v.currentTime, dur > 0 ? dur : null);
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            syncDuration(v);
            setVolume(v.volume);
            setMuted(v.muted);
            setError("");
            applyResumePosition(v);
          }}
          onDurationChange={(e) => syncDuration(e.currentTarget)}
          onLoadedData={(e) => {
            syncDuration(e.currentTarget);
            applyResumePosition(e.currentTarget);
          }}
          onCanPlay={(e) => applyResumePosition(e.currentTarget)}
          onCanPlayThrough={(e) => applyResumePosition(e.currentTarget)}
          onSeeked={(e) => {
            const v = e.currentTarget;
            const pending = pendingPositionRef.current;
            if (
              pending !== null &&
              Math.abs(v.currentTime - pending) <= 1.5
            ) {
              resumeAppliedRef.current = true;
              setCurrent(v.currentTime);
            }
          }}
          onVolumeChange={(e) => {
            setVolume(e.currentTarget.volume);
            setMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
          }}
          onEnded={() => {
            setPlaying(false);
            setIosMediaSession(title, false);
            if (progressApi) void saveProgress(0, seekMax > 0 ? seekMax : null, true);
          }}
          onError={() => {
            if (preparing || !videoSrc) return;
            setError(
              preferHlsPlayback
                ? "Playback failed. Wait for HLS packaging to finish, then tap play again."
                : "Playback failed. If this is MKV/WebM, wait for conversion to finish and reload."
            );
          }}
        >
          <source
            src={videoSrc}
            type={
              videoSrc.includes(".m3u8") || videoSrc.includes("playlist.m3u8")
                ? "application/vnd.apple.mpegurl"
                : mimeType || undefined
            }
          />
          {isIos
            ? Object.entries(nativeTrackVtts).map(([id, src]) => {
                const track = subtitleTracks.find((t) => t.id === id);
                if (!track) return null;
                return (
                  <track
                    key={id}
                    kind="captions"
                    src={src}
                    label={track.label}
                    srcLang="en"
                    default={id === activeSubtitleId}
                  />
                );
              })
            : null}
        </video>
      ) : null}

      {activeCueText && !preparing && !error && !iosNativeFs ? (
        <div
          className={`subtitle-overlay ${showControls ? "" : "controls-hidden"}`}
          aria-live="polite"
        >
          <p className="subtitle-cue">{activeCueText}</p>
        </div>
      ) : null}

      {seekFlash ? (
        <div
          className={`absolute inset-y-0 flex items-center pointer-events-none z-10 ${
            seekFlash === "-10" ? "left-[12%]" : "right-[12%]"
          }`}
          aria-hidden
        >
          <div className="rounded-full bg-black/55 px-4 py-2 text-white text-sm font-semibold tabular-nums">
            {seekFlash === "-10" ? "−10s" : "+10s"}
          </div>
        </div>
      ) : null}

      {subtitlesApi ? (
        <SubtitlePanel
          open={subtitleOpen}
          tracks={subtitleTracks}
          activeId={activeSubtitleId}
          onClose={() => {
            setSubtitleOpen(false);
            bumpControls();
          }}
          onSelect={(id) => void loadSubtitleTrack(id)}
          onUpload={uploadSubtitle}
          onDelete={deleteSubtitle}
          onOffsetDelta={(id, delta) => void adjustSubtitleOffset(id, delta)}
          onCalibrate={calibrateSubtitleTrack}
        />
      ) : null}

      <div
        className={`absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,var(--safe-bottom))] bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 z-20 ${
          showControls || preparing ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="range"
          min={0}
          max={seekMax}
          step={0.1}
          value={seekMax > 0 ? Math.min(current, seekMax) : current}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="range range-primary range-xs w-full mb-3 touch-none"
          aria-label="Seek"
        />

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              className="btn btn-ghost btn-sm text-white min-h-11 min-w-11 px-2 sm:min-w-12 shadow-none"
              onClick={() => skip(-10)}
              aria-label="Back 10 seconds"
            >
              -10s
            </button>

            <button
              type="button"
              className="btn btn-primary btn-circle min-h-11 min-w-11 shadow-none"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5 sm:size-6">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5 sm:size-6 ml-0.5">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm text-white min-h-11 min-w-11 px-2 sm:min-w-12 shadow-none"
              onClick={() => skip(10)}
              aria-label="Forward 10 seconds"
            >
              +10s
            </button>
          </div>

          <span className="text-[11px] sm:text-xs text-white/90 tabular-nums shrink-0">
            {formatTime(current)} / {formatTime(seekMax)}
          </span>

          <span className="flex-1 truncate text-xs text-white/50 hidden md:inline px-2 min-w-0">
            {title}
          </span>

          <div className="flex items-center gap-1 sm:gap-1.5 ml-auto shrink-0">
            {subtitlesApi ? (
              <button
                type="button"
                className={`btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 shadow-none ${
                  activeSubtitleId ? "text-primary" : "text-white"
                }`}
                onClick={() => {
                  setSubtitleOpen(true);
                  bumpControls();
                }}
                aria-label="Subtitles"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                  <path d="M4.5 5.25A2.25 2.25 0 016.75 3h10.5a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0117.25 18H6.75a2.25 2.25 0 01-2.25-2.25V5.25z" />
                  <path fillRule="evenodd" d="M7.5 8.25a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H8.25A.75.75 0 017.5 8.25zm4.5 0a.75.75 0 01.75-.75h5.25a.75.75 0 010 1.5H12.75a.75.75 0 01-.75-.75zm-4.5 3.75a.75.75 0 01.75-.75h5.25a.75.75 0 010 1.5H8.25a.75.75 0 01-.75-.75zm4.5 0a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H12.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle text-white min-h-11 min-w-11 shadow-none"
              onClick={toggleMute}
              aria-label={muted || displayVolume === 0 ? "Unmute" : "Mute"}
            >
              {muted || displayVolume === 0 ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l2.25-2.25a.75.75 0 000-1.06l-2.25-2.25z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                </svg>
              )}
            </button>

            {!isIos ? (
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={displayVolume}
                onChange={(e) => setVideoVolume(Number(e.target.value))}
                className="range range-primary range-xs w-14 sm:w-20 md:w-24 touch-none"
                aria-label="Volume"
              />
            ) : null}

            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle text-white min-h-11 min-w-11 shadow-none"
              onClick={() => void toggleFullscreen()}
              aria-label="Fullscreen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path fillRule="evenodd" d="M3.75 3.75a.75.75 0 000 1.5v3.036a.75.75 0 01-1.5 0V3.75A2.25 2.25 0 013.75 3h3.036a.75.75 0 010 1.5H3.75zM20.25 3.75a.75.75 0 00-1.5 0v3.036a.75.75 0 001.5 0V3.75A2.25 2.25 0 0016.214 3h3.036a.75.75 0 000 1.5h-3.036zM3.75 20.25a.75.75 0 001.5 0v-3.036a.75.75 0 00-1.5 0v3.036A2.25 2.25 0 003.75 21h3.036a.75.75 0 000-1.5H3.75zM20.25 20.25a.75.75 0 00-1.5 0v-3.036a.75.75 0 001.5 0v3.036A2.25 2.25 0 0120.25 21h-3.036a.75.75 0 000-1.5h3.036z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {!playing && showControls && !preparing && !error ? (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden
        >
          <div className="btn btn-primary btn-circle btn-lg opacity-90 min-h-14 min-w-14 sm:min-h-16 sm:min-w-16 shadow-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-7 sm:size-8 ml-1">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      ) : null}
    </div>
  );
}
