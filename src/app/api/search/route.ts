import { NextRequest, NextResponse } from "next/server";
import { extractVideoYear, formatDuration, formatVideoTitle } from "@/lib/display";
import { getUnlockedFolders } from "@/lib/folder-lock";
import { getVideoDurationFast } from "@/serve/duration-cache";
import { searchVideos } from "@/serve/search";
import { resolveVideoPath } from "@/serve/video";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 8;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const unlocked = await getUnlockedFolders();
  const all = searchVideos(q, unlocked);
  const results = all.slice(0, MAX_RESULTS).map((video) => {
    const filePath = resolveVideoPath(video.name, video.categoryId);
    return {
      name: video.name,
      title: formatVideoTitle(video.name),
      year: extractVideoYear(video.name),
      durationLabel: formatDuration(
        filePath ? getVideoDurationFast(filePath) : null
      ),      categoryId: video.categoryId,
      categoryLabel: video.categoryLabel,
      sizeLabel: video.sizeLabel,
      poster: `/api/videos/${encodeURIComponent(video.name)}/poster?cat=${encodeURIComponent(video.categoryId)}`,
      href: `/watch/${encodeURIComponent(video.name)}?cat=${encodeURIComponent(video.categoryId)}`,
    };
  });

  return NextResponse.json({ results, total: all.length });
}
