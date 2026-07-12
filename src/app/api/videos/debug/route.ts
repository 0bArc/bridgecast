import { NextRequest, NextResponse } from "next/server";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import { getPlaybackDebugSnapshot } from "@/serve/playback-debug";
import { getPlaybackStatus } from "@/serve/playback-status";
import { resolveVideoPath } from "@/serve/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const name = request.nextUrl.searchParams.get("name") || "";

  if (!cat || !resolveCategoryDir(cat)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (!(await isCategoryAccessible(cat))) {
    return NextResponse.json({ error: "Folder locked" }, { status: 403 });
  }

  const filePath = resolveVideoPath(decodeURIComponent(name), cat);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: getPlaybackStatus(filePath),
    debug: getPlaybackDebugSnapshot(filePath),
  });
}
