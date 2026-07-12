"use client";

import { useEffect, useState } from "react";
import { isIosDevice } from "@/lib/client-device";
import type { PlaybackDebugSnapshot } from "@/serve/playback-debug";
import type { PlaybackStatus } from "@/serve/playback-status";

export type ClientPlaybackDebug = {
  videoSrc: string;
  hlsFallback: boolean;
  hlsReadyState: boolean;
  preferHlsPlayback: boolean;
  preparing: boolean;
  packagingHls: boolean;
  isIos: boolean;
};

type ServerDebug = {
  filePath: string;
  remux: boolean;
  mp4Ready: boolean;
  hlsReady: boolean;
  ipadNative: boolean;
  cachedMp4: string | null;
  hlsDir: string | null;
  src: string;
  hlsSrc: string;
  statusSrc: string;
  debugSrc: string;
  status: PlaybackStatus;
};

type Props = {
  server: ServerDebug;
  client: ClientPlaybackDebug | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | boolean | number | null | undefined;
}) {
  const text =
    value === null || value === undefined
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "yes"
          : "no"
        : String(value);

  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 border-b border-white/[0.06] text-xs">
      <span className="text-white/45 shrink-0">{label}</span>
      <span className="text-white/90 break-all font-mono">{text}</span>
    </div>
  );
}

export function WatchDebugPanel({ server, client }: Props) {
  const [liveStatus, setLiveStatus] = useState<PlaybackStatus>(server.status);
  const [debug, setDebug] = useState<PlaybackDebugSnapshot | null>(null);
  const [pollAt, setPollAt] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(server.debugSrc, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          status: PlaybackStatus;
          debug: PlaybackDebugSnapshot;
        };
        if (!cancelled) {
          setLiveStatus(data.status);
          setDebug(data.debug);
          setPollAt(new Date().toLocaleTimeString());
        }
      } catch {
        /* ignore */
      }
    }

    void poll();
    const id = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [server.debugSrc]);

  const isIos = client?.isIos ?? isIosDevice();
  const inv = debug?.hlsInventory;
  const lastSeg = debug?.lastSegment;

  return (
    <aside className="w-full lg:w-80 xl:w-[26rem] shrink-0 border-r border-white/[0.08] bg-base-200/40 overflow-y-auto max-h-[50vh] lg:max-h-none">
      <div className="p-4 space-y-4 pb-8">
        <div>
          <h1 className="text-sm font-semibold text-white">Playback debug</h1>
          <p className="text-xs text-white/45 mt-1">
            Live · polled {pollAt || "…"}
          </p>
        </div>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Now serving
          </h2>
          <Row
            label="last asset"
            value={
              lastSeg
                ? `${lastSeg.file}${lastSeg.range ? ` (${lastSeg.range})` : ""}`
                : "—"
            }
          />
          <Row
            label="last at"
            value={lastSeg ? formatTime(lastSeg.at) : null}
          />
          <Row label="last bytes" value={lastSeg?.bytes ?? null} />
          <Row label="HLS viewers" value={debug?.hlsStatus.viewers ?? null} />
          <Row
            label="packaging"
            value={debug?.hlsStatus.packaging ?? liveStatus.hlsPackaging}
          />
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            HLS cache on disk
          </h2>
          <Row label="segments" value={inv?.segmentCount ?? null} />
          <Row
            label="cache size"
            value={inv ? formatBytes(inv.totalBytes) : null}
          />
          <Row label="init" value={inv?.init ?? null} />
          {inv && inv.segments.length > 0 ? (
            <div className="mt-2 max-h-28 overflow-y-auto rounded border border-white/[0.06] bg-black/30 p-2">
              <p className="text-[10px] text-white/35 mb-1 font-mono">
                {inv.segments.length} × .m4s
              </p>
              <p className="text-[10px] text-white/60 font-mono leading-relaxed break-all">
                {inv.segments.slice(0, 8).join(", ")}
                {inv.segments.length > 8
                  ? ` … +${inv.segments.length - 8} more`
                  : ""}
              </p>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Segment serve history
          </h2>
          {(debug?.segmentHistory.length ?? 0) === 0 ? (
            <p className="text-xs text-white/40 font-mono">no .m4s requests yet</p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {debug?.segmentHistory.map((s, i) => (
                <div
                  key={`${s.at}-${s.file}-${i}`}
                  className="text-[10px] font-mono text-white/70 border-b border-white/[0.04] py-1"
                >
                  <span className="text-white/40">{formatTime(s.at)}</span>{" "}
                  <span className="text-emerald-300/90">{s.file}</span>
                  {s.range ? (
                    <span className="text-white/45"> {s.range}</span>
                  ) : null}
                  {s.bytes !== undefined ? (
                    <span className="text-white/45"> · {formatBytes(s.bytes)}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Cleanup log
          </h2>
          {(debug?.cleanupEvents.length ?? 0) === 0 ? (
            <p className="text-xs text-white/40 font-mono">none recorded</p>
          ) : (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {debug?.cleanupEvents.map((e, i) => (
                <div
                  key={`${e.at}-${i}`}
                  className="text-[10px] font-mono text-amber-200/80 border-b border-white/[0.04] py-1"
                >
                  <span className="text-white/40">{formatTime(e.at)}</span>{" "}
                  {e.detail}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Recent events
          </h2>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {(debug?.recentEvents.length ?? 0) === 0 ? (
              <p className="text-xs text-white/40 font-mono">waiting…</p>
            ) : (
              debug?.recentEvents.map((e, i) => (
                <div
                  key={`${e.at}-${e.kind}-${i}`}
                  className="text-[10px] font-mono text-white/65 border-b border-white/[0.04] py-1"
                >
                  <span className="text-white/35">{formatTime(e.at)}</span>{" "}
                  <span className="text-sky-300/80">{e.kind}</span>{" "}
                  {e.detail}
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Client
          </h2>
          <Row label="iOS/iPad" value={isIos} />
          <Row label="videoSrc" value={client?.videoSrc || "—"} />
          <Row label="prefer HLS" value={client?.preferHlsPlayback ?? false} />
          <Row label="HLS ready" value={client?.hlsReadyState ?? false} />
          <Row label="HLS fallback" value={client?.hlsFallback ?? false} />
          <Row label="preparing" value={client?.preparing ?? false} />
          <Row label="packaging UI" value={client?.packagingHls ?? false} />
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Server snapshot
          </h2>
          <Row label="file" value={server.filePath} />
          <Row label="needs remux" value={server.remux} />
          <Row label="MP4 ready" value={server.mp4Ready} />
          <Row label="HLS ready" value={server.hlsReady} />
          <Row label="MP4 xcode" value={debug?.mp4TranscodeInFlight ?? false} />
          <Row label="cached MP4" value={debug?.cachedMp4 ?? server.cachedMp4} />
          <Row label="HLS dir" value={debug?.hlsDir ?? server.hlsDir} />
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-white/40 mb-2">
            Live status
          </h2>
          <Row label="ready" value={liveStatus.ready} />
          <Row label="hlsReady" value={liveStatus.hlsReady} />
          <Row label="preparing" value={liveStatus.preparing} />
          <Row label="progress" value={liveStatus.progress} />
          <Row label="error" value={liveStatus.error} />
        </section>
      </div>
    </aside>
  );
}
