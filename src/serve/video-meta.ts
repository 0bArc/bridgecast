import {
  extractVideoYear,
  formatDuration,
  formatVideoTitle,
} from "@/lib/display";
import { getVideoDurationFast } from "@/serve/duration-cache";
import { resolveVideoPath } from "@/serve/video";

export type VideoMeta = {
  title: string;
  year: number | null;
  durationLabel: string;
};

export function getVideoMeta(name: string, categoryId: string): VideoMeta {
  const filePath = resolveVideoPath(name, categoryId);
  const duration = filePath ? getVideoDurationFast(filePath) : null;
  return {
    title: formatVideoTitle(name),
    year: extractVideoYear(name),
    durationLabel: formatDuration(duration),
  };
}
