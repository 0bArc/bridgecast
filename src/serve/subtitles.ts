import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import {
  applySubtitleOffset,
  cuesToSrt,
  mergeSubtitleTracks,
  parseSrt,
} from "@/lib/srt";
import {
  calibrateSubtitles,
  extractEmbeddedSubs,
  getEmbeddedCues,
  getMergeOffsetForTime,
  type CalibrationSegment,
  type SubtitleCalibration,
} from "@/serve/subtitle-sync";

export const EMBEDDED_SUBTITLE_ID = "__embedded__";

export type SubtitleTrack = {
  id: string;
  label: string;
  offset: number;
  embedded?: boolean;
  calibration?: SubtitleCalibration;
};

type SubtitleMetaEntry = {
  merge: number;
  shift: number;
  segments?: CalibrationSegment[];
  calibration?: SubtitleCalibration;
};

type SubtitleMeta = Record<string, SubtitleMetaEntry>;

function normalizeMetaEntry(
  entry:
    | { merge?: number; shift?: number; offset?: number; segments?: CalibrationSegment[]; calibration?: SubtitleCalibration }
    | undefined
): SubtitleMetaEntry {
  if (!entry) return { merge: 0, shift: 0 };
  if (typeof entry.merge === "number" || typeof entry.shift === "number") {
    return {
      merge: entry.merge ?? 0,
      shift: entry.shift ?? 0,
      segments: entry.segments,
      calibration: entry.calibration,
    };
  }
  return { merge: entry.offset ?? 0, shift: 0, segments: entry.segments, calibration: entry.calibration };
}

function mergeResolver(entry: SubtitleMetaEntry): number | ((time: number) => number) {
  if (entry.segments?.length) {
    return (time: number) =>
      getMergeOffsetForTime(time, entry.merge, entry.segments!);
  }
  return entry.merge;
}

function videoKey(filePath: string): string {
  const stat = fs.statSync(filePath);
  return createHash("sha256")
    .update(`${filePath}|${stat.size}|${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 20);
}

function subtitleDir(filePath: string): string {
  const dir = path.join(
    process.cwd(),
    ".cache",
    "subtitles",
    videoKey(filePath)
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function metaPath(filePath: string): string {
  return path.join(subtitleDir(filePath), "meta.json");
}

function embeddedCachePath(filePath: string): string {
  return path.join(subtitleDir(filePath), `${EMBEDDED_SUBTITLE_ID}.srt`);
}

function readMeta(filePath: string): SubtitleMeta {
  const file = metaPath(filePath);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as SubtitleMeta;
  } catch {
    return {};
  }
}

function writeMeta(filePath: string, meta: SubtitleMeta): void {
  fs.writeFileSync(metaPath(filePath), JSON.stringify(meta, null, 2), "utf8");
}

function safeId(filename: string): string | null {
  const base = path
    .basename(filename, path.extname(filename))
    .replace(/[^\w\s().-]/g, "")
    .trim()
    .slice(0, 80);
  return base || null;
}

function trackPath(filePath: string, id: string): string | null {
  if (id === EMBEDDED_SUBTITLE_ID) return embeddedCachePath(filePath);
  const safe = safeId(id);
  if (!safe) return null;
  const dir = path.resolve(subtitleDir(filePath));
  const full = path.resolve(path.join(dir, `${safe}.srt`));
  if (!full.startsWith(dir + path.sep) && full !== dir) return null;
  return full;
}

function ensureEmbeddedCache(filePath: string): string | null {
  const cached = embeddedCachePath(filePath);
  if (fs.existsSync(cached) && fs.statSync(cached).size > 0) {
    return fs.readFileSync(cached, "utf8");
  }

  const extracted = extractEmbeddedSubs(filePath);
  if (!extracted) return null;

  fs.writeFileSync(cached, extracted.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"), "utf8");
  return extracted;
}

export function hasEmbeddedSubtitles(filePath: string): boolean {
  return getEmbeddedCues(filePath).length > 0 || ensureEmbeddedCache(filePath) !== null;
}

export function getSubtitleOffset(filePath: string, id: string): number {
  if (id === EMBEDDED_SUBTITLE_ID) {
    return normalizeMetaEntry(readMeta(filePath)[id]).shift;
  }
  return normalizeMetaEntry(readMeta(filePath)[id]).merge;
}

export function getSubtitleShift(filePath: string, id: string): number {
  return normalizeMetaEntry(readMeta(filePath)[id]).shift;
}

export function setSubtitleOffset(
  filePath: string,
  id: string,
  offset: number
): number {
  if (id === EMBEDDED_SUBTITLE_ID) {
    const meta = readMeta(filePath);
    const entry = normalizeMetaEntry(meta[id]);
    entry.shift = Math.round(offset * 1000) / 1000;
    meta[id] = entry;
    writeMeta(filePath, meta);
    return entry.shift;
  }

  const meta = readMeta(filePath);
  const entry = normalizeMetaEntry(meta[id]);
  entry.shift = Math.round(offset * 1000) / 1000;
  meta[id] = entry;
  writeMeta(filePath, meta);
  return entry.shift;
}

export function listSubtitles(filePath: string): SubtitleTrack[] {
  const dir = subtitleDir(filePath);
  const tracks: SubtitleTrack[] = [];

  if (hasEmbeddedSubtitles(filePath)) {
    const embeddedShift = normalizeMetaEntry(
      readMeta(filePath)[EMBEDDED_SUBTITLE_ID]
    ).shift;
    tracks.push({
      id: EMBEDDED_SUBTITLE_ID,
      label: "Embedded (MKV)",
      offset: embeddedShift,
      embedded: true,
    });
  }

  if (!fs.existsSync(dir)) return tracks;

  const files = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".srt") &&
        f.toLowerCase() !== `${EMBEDDED_SUBTITLE_ID}.srt`
    );

  const meta = readMeta(filePath);
  for (const f of files) {
    const id = f.replace(/\.srt$/i, "");
    const raw = meta[id];
    if (raw && !("merge" in raw) && "offset" in raw) {
      resyncSubtitle(filePath, id);
    } else if (!(id in meta)) {
      resyncSubtitle(filePath, id);
    }
  }

  const synced = readMeta(filePath);
  for (const f of files) {
    const id = f.replace(/\.srt$/i, "");
    const entry = normalizeMetaEntry(synced[id]);
    tracks.push({
      id,
      label: id,
      offset: entry.shift,
      calibration: entry.calibration,
    });
  }

  return tracks.sort((a, b) => {
    if (a.embedded) return -1;
    if (b.embedded) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function readSubtitle(filePath: string, id: string): string | null {
  const shift = getSubtitleShift(filePath, id);

  if (id === EMBEDDED_SUBTITLE_ID) {
    const embedded = ensureEmbeddedCache(filePath);
    if (!embedded) return null;
    if (!shift) return embedded;
    return cuesToSrt(applySubtitleOffset(parseSrt(embedded), shift));
  }

  const full = trackPath(filePath, id);
  if (!full || !fs.existsSync(full)) return null;

  const uploaded = fs.readFileSync(full, "utf8");
  const embedded = getEmbeddedCues(filePath);
  if (!embedded.length) {
    if (!shift) return uploaded;
    return cuesToSrt(applySubtitleOffset(parseSrt(uploaded), shift));
  }

  const mergeOffset = mergeResolver(normalizeMetaEntry(readMeta(filePath)[id]));
  const merged = mergeSubtitleTracks(
    parseSrt(uploaded),
    embedded,
    mergeOffset
  );
  return cuesToSrt(shift ? applySubtitleOffset(merged, shift) : merged);
}

export function saveSubtitle(
  filePath: string,
  filename: string,
  content: string
): SubtitleTrack {
  if (!content.includes("-->")) {
    throw new Error("Invalid SRT file");
  }

  const id = safeId(filename);
  if (!id) throw new Error("Invalid filename");

  const full = trackPath(filePath, id);
  if (!full) throw new Error("Invalid filename");

  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  fs.writeFileSync(full, normalized, "utf8");

  const cues = parseSrt(normalized);
  const calibration = calibrateSubtitles(filePath, cues);
  const meta = readMeta(filePath);
  meta[id] = {
    merge: calibration.merge,
    shift: 0,
    segments: calibration.segments,
    calibration,
  };
  writeMeta(filePath, meta);

  return { id, label: id, offset: 0, calibration };
}

export function deleteSubtitle(filePath: string, id: string): boolean {
  if (id === EMBEDDED_SUBTITLE_ID) return false;
  const full = trackPath(filePath, id);
  if (!full || !fs.existsSync(full)) return false;
  fs.unlinkSync(full);

  const meta = readMeta(filePath);
  delete meta[id];
  writeMeta(filePath, meta);
  return true;
}

/** Re-sync an existing track against embedded MKV subtitles. */
export function resyncSubtitle(filePath: string, id: string): number {
  if (id === EMBEDDED_SUBTITLE_ID) return 0;

  const full = trackPath(filePath, id);
  if (!full || !fs.existsSync(full)) return 0;

  const calibration = calibrateSubtitles(
    filePath,
    parseSrt(fs.readFileSync(full, "utf8"))
  );
  const meta = readMeta(filePath);
  const entry = normalizeMetaEntry(meta[id]);
  entry.merge = calibration.merge;
  entry.segments = calibration.segments;
  entry.calibration = calibration;
  meta[id] = entry;
  writeMeta(filePath, meta);
  return entry.merge;
}

/** Full calibration pass — updates merge, segments, and stores report. */
export function calibrateSubtitleTrack(
  filePath: string,
  id: string
): SubtitleCalibration {
  if (id === EMBEDDED_SUBTITLE_ID) {
    return {
      merge: 0,
      segments: [],
      matches: 0,
      confidence: 1,
      embeddedAvailable: true,
      gapsFilled: 0,
      driftDetected: false,
    };
  }

  const full = trackPath(filePath, id);
  if (!full || !fs.existsSync(full)) {
    return {
      merge: 0,
      segments: [],
      matches: 0,
      confidence: 0,
      embeddedAvailable: hasEmbeddedSubtitles(filePath),
      gapsFilled: 0,
      driftDetected: false,
    };
  }

  const calibration = calibrateSubtitles(
    filePath,
    parseSrt(fs.readFileSync(full, "utf8"))
  );
  const meta = readMeta(filePath);
  const entry = normalizeMetaEntry(meta[id]);
  entry.merge = calibration.merge;
  entry.segments = calibration.segments;
  entry.calibration = calibration;
  meta[id] = entry;
  writeMeta(filePath, meta);
  return calibration;
}
