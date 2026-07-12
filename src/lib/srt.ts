export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

function parseSrtTimestamp(value: string): number {
  const cleaned = value.trim().replace(/\./g, ",");
  const [h, m, rest] = cleaned.split(":");
  const [s, ms] = rest.split(",");
  return (
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
  );
}

function formatVttTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms
    .toString()
    .padStart(3, "0")}`;
}

export function cuesToVtt(cues: SubtitleCue[]): string {
  if (!cues.length) return "WEBVTT\n";
  return [
    "WEBVTT",
    "",
    ...cues.flatMap((cue) => [
      `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`,
      cue.text,
      "",
    ]),
  ].join("\n");
}

function formatSrtTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
}

export function stripSubtitleMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\an\d\}/g, "")
    .trim();
}

export function parseSrt(content: string): SubtitleCue[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const cues: SubtitleCue[] = [];
  for (const block of normalized.split(/\n\n+/)) {
    const lines = block.split("\n").filter((line) => line.length > 0);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex < 0) continue;

    const [startRaw, endRaw] = lines[timeIndex].split("-->");
    const start = parseSrtTimestamp(startRaw);
    const end = parseSrtTimestamp(endRaw);
    const text = stripSubtitleMarkup(
      lines.slice(timeIndex + 1).join("\n").trim()
    );
    if (!text || end <= start) continue;
    cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, index) => {
      return [
        String(index + 1),
        `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
        cue.text,
      ].join("\n");
    })
    .join("\n\n");
}

export function applySubtitleOffset(
  cues: SubtitleCue[],
  offsetSeconds: number
): SubtitleCue[] {
  if (!offsetSeconds) return cues;
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + offsetSeconds),
    end: Math.max(0, cue.end + offsetSeconds),
  }));
}

function cuesOverlap(
  a: SubtitleCue,
  b: SubtitleCue,
  slackSeconds = 0
): boolean {
  return a.start <= b.end + slackSeconds && b.start <= a.end + slackSeconds;
}

function textScore(a: string, b: string): number {
  const na = a
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nb = b
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const aw = new Set(na.split(" "));
  const bw = new Set(nb.split(" "));
  let shared = 0;
  for (const w of aw) if (bw.has(w)) shared++;
  return shared / Math.max(aw.size, bw.size);
}

/** Embedded timeline + uploaded wording where lines match; fills gaps from MKV. */
export function mergeSubtitleTracks(
  uploaded: SubtitleCue[],
  embedded: SubtitleCue[],
  mergeOffset: number | ((embeddedTime: number) => number)
): SubtitleCue[] {
  if (!embedded.length) return uploaded;
  if (!uploaded.length) return embedded;

  const resolveOffset = (time: number) =>
    typeof mergeOffset === "function" ? mergeOffset(time) : mergeOffset;

  const merged = embedded.map((cue) => ({ ...cue }));

  for (let i = 0; i < merged.length; i++) {
    const embeddedCue = merged[i];
    const shiftedUploaded = applySubtitleOffset(
      uploaded,
      resolveOffset(embeddedCue.start)
    );

    let bestUploaded: SubtitleCue | null = null;
    let bestScore = 0;
    for (const uploadedCue of shiftedUploaded) {
      if (!cuesOverlap(uploadedCue, embeddedCue, 2)) continue;
      const score = textScore(uploadedCue.text, embeddedCue.text);
      if (score > bestScore) {
        bestScore = score;
        bestUploaded = uploadedCue;
      }
    }

    if (bestUploaded && bestScore >= 0.35) {
      merged[i] = { ...embeddedCue, text: bestUploaded.text };
    }
  }

  return merged;
}

export function findActiveCue(
  cues: SubtitleCue[],
  time: number
): SubtitleCue | null {
  let best: SubtitleCue | null = null;
  for (const cue of cues) {
    if (time >= cue.start && time <= cue.end) {
      if (!best || cue.end - cue.start > best.end - best.start) best = cue;
    }
  }
  return best;
}
