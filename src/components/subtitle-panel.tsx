"use client";

import { useRef, useState } from "react";

export type SubtitleCalibrationInfo = {
  merge: number;
  matches: number;
  confidence: number;
  embeddedAvailable: boolean;
  gapsFilled: number;
  driftDetected: boolean;
  segments?: Array<{ from: number; merge: number }>;
};

export type SubtitleTrack = {
  id: string;
  label: string;
  offset: number;
  embedded?: boolean;
  calibration?: SubtitleCalibrationInfo;
};

type Props = {
  open: boolean;
  tracks: SubtitleTrack[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOffsetDelta: (id: string, delta: number) => void;
  onCalibrate: (id: string) => Promise<SubtitleCalibrationInfo | null>;
};

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSegmentTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

export function SubtitlePanel({
  open,
  tracks,
  activeId,
  onClose,
  onSelect,
  onUpload,
  onDelete,
  onOffsetDelta,
  onCalibrate,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastCalibration, setLastCalibration] =
    useState<SubtitleCalibrationInfo | null>(null);

  if (!open) return null;

  const activeTrack = tracks.find((t) => t.id === activeId);
  const calibration = lastCalibration ?? activeTrack?.calibration ?? null;

  async function handleFile(file: File) {
    setUploading(true);
    setError("");
    try {
      await onUpload(file);
      setLastCalibration(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleCalibrate(id: string) {
    setCalibrating(true);
    setError("");
    try {
      const result = await onCalibrate(id);
      setLastCalibration(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calibration failed");
    } finally {
      setCalibrating(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-base-300 border border-base-content/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-content/10">
          <h2 className="text-base font-semibold">Subtitles</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-circle"
            onClick={onClose}
            aria-label="Close subtitles"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[min(70dvh,28rem)] overflow-y-auto">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-base-content/50">
              Audio &amp; Subtitles
            </p>
            <button
              type="button"
              className={`btn btn-block justify-start btn-sm ${
                activeId === null ? "btn-primary" : "btn-ghost"
              }`}
              onClick={() => onSelect(null)}
            >
              Off
            </button>
            {tracks.map((track) => (
              <div key={track.id} className="flex gap-2">
                <button
                  type="button"
                  className={`btn flex-1 justify-start btn-sm ${
                    activeId === track.id ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => onSelect(track.id)}
                >
                  <span className="truncate">{track.label}</span>
                  {track.offset ? (
                    <span className="ml-auto text-[10px] opacity-60 tabular-nums">
                      {track.offset > 0 ? "+" : ""}
                      {track.offset.toFixed(1)}s
                    </span>
                  ) : null}
                </button>
                {!track.embedded ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square text-error"
                    disabled={deletingId === track.id}
                    onClick={() => {
                      setDeletingId(track.id);
                      void onDelete(track.id).finally(() => setDeletingId(null));
                    }}
                    aria-label={`Delete ${track.label}`}
                  >
                    {deletingId === track.id ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
                        <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.599.737c1.262.227 2.148 1.378 2.148 2.66v6.75a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25V7.844c0-1.282.886-2.433 2.148-2.66A48.816 48.816 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.368 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.368 0c.877.028 1.554.81 1.554 1.688v.227a49.23 49.23 0 00-6.186 0v-.227c0-.878.677-1.66 1.554-1.688zM9.75 9.75v6.75h4.5V9.75h-4.5z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {activeTrack?.embedded ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-base-content/50">
                Sync
              </p>
              <p className="text-xs text-base-content/60">
                From MKV — already matched to this file.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => onOffsetDelta(activeTrack.id, -0.5)}
                >
                  −0.5s
                </button>
                <span className="text-sm tabular-nums flex-1 text-center">
                  {activeTrack.offset > 0 ? "+" : ""}
                  {activeTrack.offset.toFixed(1)}s
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => onOffsetDelta(activeTrack.id, 0.5)}
                >
                  +0.5s
                </button>
              </div>
            </div>
          ) : null}

          {activeTrack && !activeTrack.embedded ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-base-content/50">
                  Sync
                </p>
                <p className="text-xs text-base-content/60">
                  Calibrated against MKV subs. Gaps filled automatically.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onOffsetDelta(activeTrack.id, -0.5)}
                  >
                    −0.5s
                  </button>
                  <span className="text-sm tabular-nums flex-1 text-center">
                    {activeTrack.offset > 0 ? "+" : ""}
                    {activeTrack.offset.toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => onOffsetDelta(activeTrack.id, 0.5)}
                  >
                    +0.5s
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    disabled={calibrating}
                    onClick={() => void handleCalibrate(activeTrack.id)}
                  >
                    {calibrating ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      "Calibrate"
                    )}
                  </button>
                </div>
              </div>

              {calibration ? (
                <div className="rounded-lg bg-base-200/80 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-base-content/60">Confidence</span>
                    <span className="font-medium tabular-nums">
                      {formatConfidence(calibration.confidence)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-base-content/60">Lines matched</span>
                    <span className="font-medium tabular-nums">
                      {calibration.matches}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-base-content/60">Gaps filled</span>
                    <span className="font-medium tabular-nums">
                      {calibration.gapsFilled}
                    </span>
                  </div>
                  {calibration.driftDetected ? (
                    <p className="text-warning pt-1">
                      Timing drift detected — using segment offsets across the movie.
                    </p>
                  ) : (
                    <p className="text-base-content/50 pt-1">
                      Single offset {calibration.merge > 0 ? "+" : ""}
                      {calibration.merge.toFixed(1)}s applied.
                    </p>
                  )}
                  {calibration.segments && calibration.segments.length > 1 ? (
                    <div className="pt-1 space-y-0.5 text-base-content/50">
                      {calibration.segments.map((segment) => (
                        <div key={segment.from} className="flex justify-between">
                          <span>From {formatSegmentTime(segment.from)}</span>
                          <span className="tabular-nums">
                            {segment.merge > 0 ? "+" : ""}
                            {segment.merge.toFixed(1)}s
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!calibration.embeddedAvailable ? (
                    <p className="text-warning pt-1">
                      No embedded subs in file — upload only, manual sync needed.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-base-content/50">
              Upload .srt
            </p>
            <div
              className="border-2 border-dashed border-base-content/20 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".srt,text/plain"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <span className="loading loading-spinner loading-md text-primary" />
              ) : (
                <>
                  <p className="text-sm font-medium">Drop .srt here or click to browse</p>
                  <p className="text-xs text-base-content/50 mt-1">
                    Auto-calibrated to this file on upload
                  </p>
                </>
              )}
            </div>
            {error ? <p className="text-xs text-error">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
