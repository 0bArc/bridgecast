import { getFolderMasks } from "@/lib/config";

const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v)$/i;

/** Release metadata tokens stripped from filenames (matched whole token). */
const METADATA_TOKEN =
  /^(?:\d{3,4}p|4k|uhd|hdr10?|dv|dovi|webrip|web[- ]?dl|webdl|bluray|bdrip|brrip|dvdrip|hdtv|hdrip|hevc|x265|x264|h265|h264|av1|aac|ac3|dd5?\.?1|dts|truehd|atmos|multi|dual|amzn|nf|atvp|proper|repack|repack2|extended|unrated|remux|internal|subbed|dubbed|\d+mb|gb|web|rip)$/i;

const RELEASE_YEAR = /^(19\d{2}|20\d{2})$/;

/** Clean release filename → display title (e.g. strip 1080p, WEBRip, x265, group). */
export function formatVideoTitle(filename: string): string {
  let base = filename.replace(VIDEO_EXT, "").trim();
  base = base.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  // Keep audio tags like DD5.1 intact when dots/underscores become spaces.
  base = base.replace(/\b(DD?\d+\.\d+)\b/gi, (m) => m.replace(".", "\u0000"));
  base = base.replace(/[._]+/g, " ").replace(/\u0000/g, ".");
  base = base.replace(/\s+/g, " ").trim();
  base = base.replace(/-\S+$/, "").trim();

  const tokens = mergeSplitAudioTags(base.split(" ").filter(Boolean));
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const bare = last.replace(/-[A-Za-z0-9][A-Za-z0-9.]*$/i, "");
    if (METADATA_TOKEN.test(bare) || METADATA_TOKEN.test(last) || RELEASE_YEAR.test(last)) {
      tokens.pop();
      continue;
    }
    break;
  }

  const title = tokens.join(" ").trim();
  return title || base;
}

/** Release year from filename (e.g. Movie.2024.1080p.mkv → 2024). */
export function extractVideoYear(filename: string): number | null {
  let base = filename.replace(VIDEO_EXT, "").trim();
  base = base.replace(/[._]+/g, " ");
  for (const token of base.split(" ").filter(Boolean)) {
    if (RELEASE_YEAR.test(token)) return Number.parseInt(token, 10);
  }
  return null;
}

/** Human duration for cards (e.g. 5520 → "1h 32m"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${total}s`;
}

/** Rejoin DD5 + 1 → DD5.1 when dot was lost to separator normalization. */
function mergeSplitAudioTags(tokens: string[]): string[] {
  const out = [...tokens];
  for (let i = out.length - 1; i > 0; i--) {
    if (/^DD?\d+$/i.test(out[i - 1]!) && /^\d$/.test(out[i]!)) {
      out[i - 1] = `${out[i - 1]}.${out[i]}`;
      out.splice(i, 1);
    }
  }
  return out;
}

/** Display label for one folder segment path (e.g. "Porn" or "Porn/CamGirls"). */
export function getDisplayName(categoryId: string): string {
  const masks = getFolderMasks();
  if (masks[categoryId]) return masks[categoryId];
  const parts = categoryId.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? categoryId;
}

/** Breadcrumb-style path with masks applied per segment. */
export function formatCategoryPath(categoryId: string): string {
  if (!categoryId) return "Library";
  const parts = categoryId.split("/").filter(Boolean);
  let built = "";
  return parts
    .map((segment) => {
      built = built ? `${built}/${segment}` : segment;
      return getDisplayName(built);
    })
    .join(" › ");
}
