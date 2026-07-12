import { execFileSync } from "child_process";
import { parseSrt, stripSubtitleMarkup, type SubtitleCue } from "@/lib/srt";

export type CalibrationSegment = {
  from: number;
  merge: number;
};

export type SubtitleCalibration = {
  merge: number;
  segments: CalibrationSegment[];
  matches: number;
  confidence: number;
  embeddedAvailable: boolean;
  gapsFilled: number;
  driftDetected: boolean;
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textScore(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) {
    return 0.85;
  }
  const aw = new Set(na.split(" "));
  const bw = new Set(nb.split(" "));
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared++;
  return shared / Math.max(aw.size, bw.size);
}

function clusterMedian(offsets: number[]): number {
  if (!offsets.length) return 0;
  const sorted = [...offsets].sort((a, b) => a - b);
  const bins = new Map<number, number>();
  for (const offset of sorted) {
    const bucket = Math.round(offset);
    bins.set(bucket, (bins.get(bucket) ?? 0) + 1);
  }

  let bestBucket = Math.round(sorted[Math.floor(sorted.length / 2)]);
  let bestCount = 0;
  for (const [bucket, count] of bins) {
    if (count > bestCount) {
      bestCount = count;
      bestBucket = bucket;
    }
  }

  const cluster = sorted.filter((offset) => Math.abs(offset - bestBucket) <= 3);
  const mid = Math.floor(cluster.length / 2);
  return cluster.length % 2 === 0
    ? (cluster[mid - 1] + cluster[mid]) / 2
    : cluster[mid];
}

function findBestMatch(
  ref: SubtitleCue,
  uploaded: SubtitleCue[],
  roughOffset: number,
  windowSeconds: number
): { score: number; cue: SubtitleCue } | null {
  let best: { score: number; cue: SubtitleCue } | null = null;
  for (const cue of uploaded) {
    const shiftedStart = cue.start + roughOffset;
    if (Math.abs(shiftedStart - ref.start) > windowSeconds) continue;
    const score = textScore(ref.text, cue.text);
    if (!best || score > best.score) best = { score, cue };
  }
  return best;
}

export function extractEmbeddedSubs(videoPath: string): string | null {
  try {
    const stdout = execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        videoPath,
        "-map",
        "0:s:0",
        "-f",
        "srt",
        "-",
      ],
      { maxBuffer: 20 * 1024 * 1024, timeout: 120_000 }
    );
    const text = stdout.toString("utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

export function getEmbeddedCues(videoPath: string): SubtitleCue[] {
  const raw = extractEmbeddedSubs(videoPath);
  if (!raw) return [];
  return parseSrt(raw);
}

export function getMergeOffsetForTime(
  embeddedTime: number,
  merge: number,
  segments: CalibrationSegment[]
): number {
  if (!segments.length) return merge;
  let chosen = segments[0].merge;
  for (const segment of segments) {
    if (embeddedTime >= segment.from) chosen = segment.merge;
  }
  return chosen;
}

/** Full calibration — samples whole movie, detects drift, returns segment offsets. */
export function calibrateSubtitles(
  videoPath: string,
  uploaded: SubtitleCue[]
): SubtitleCalibration {
  const embedded = getEmbeddedCues(videoPath);
  if (embedded.length < 3 || uploaded.length < 3) {
    return {
      merge: 0,
      segments: [],
      matches: 0,
      confidence: 0,
      embeddedAvailable: embedded.length > 0,
      gapsFilled: embedded.length,
      driftDetected: false,
    };
  }

  const duration = embedded[embedded.length - 1].end;
  const bucketCount = 8;
  const bucketSize = Math.max(duration / bucketCount, 300);
  const bucketOffsets = new Map<number, number[]>();
  const allMatches: Array<{ embedded: SubtitleCue; uploaded: SubtitleCue; offset: number }> =
    [];

  const roughPool: number[] = [];
  for (const ref of embedded) {
    const text = normalizeText(stripSubtitleMarkup(ref.text));
    if (text.length < 28) continue;
    const best = findBestMatch(ref, uploaded, 0, 120);
    if (!best || best.score < 0.82) continue;
    roughPool.push(ref.start - best.cue.start);
  }
  const rough = clusterMedian(roughPool);

  for (const ref of embedded) {
    const text = normalizeText(stripSubtitleMarkup(ref.text));
    if (text.length < 10) continue;

    const best = findBestMatch(ref, uploaded, rough, 10);
    if (!best || best.score < 0.55) continue;

    const offset = ref.start - best.cue.start;
    allMatches.push({ embedded: ref, uploaded: best.cue, offset });

    const bucket = Math.floor(ref.start / bucketSize) * bucketSize;
    const list = bucketOffsets.get(bucket) ?? [];
    list.push(offset);
    bucketOffsets.set(bucket, list);
  }

  const merge = Math.round(clusterMedian(allMatches.map((m) => m.offset)) * 1000) / 1000;
  const segments: CalibrationSegment[] = [];
  const sortedBuckets = [...bucketOffsets.entries()].sort((a, b) => a[0] - b[0]);

  for (const [from, offsets] of sortedBuckets) {
    if (offsets.length < 2) continue;
    segments.push({
      from,
      merge: Math.round(clusterMedian(offsets) * 1000) / 1000,
    });
  }

  if (segments.length === 0 && merge !== 0) {
    segments.push({ from: 0, merge });
  }

  const mergeValues = segments.map((s) => s.merge);
  const driftDetected =
    mergeValues.length > 1 &&
    Math.max(...mergeValues) - Math.min(...mergeValues) > 6;

  const matchedEmbedded = new Set<number>();
  for (const match of allMatches) {
    matchedEmbedded.add(match.embedded.start);
  }

  const confidence =
    allMatches.length === 0
      ? 0
      : Math.min(
          1,
          allMatches.length / Math.max(embedded.length * 0.15, 20)
        );

  return {
    merge,
    segments,
    matches: allMatches.length,
    confidence: Math.round(confidence * 1000) / 1000,
    embeddedAvailable: true,
    gapsFilled: embedded.length - matchedEmbedded.size,
    driftDetected,
  };
}

/** Seconds to add to uploaded SRT times to match this video file. */
export function detectSubtitleOffset(
  videoPath: string,
  uploaded: SubtitleCue[]
): number {
  return calibrateSubtitles(videoPath, uploaded).merge;
}

export function calibrateSubtitleSegments(
  videoPath: string,
  uploaded: SubtitleCue[]
): CalibrationSegment[] {
  return calibrateSubtitles(videoPath, uploaded).segments;
}
