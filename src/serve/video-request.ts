import { NextRequest, NextResponse } from "next/server";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import { getPlaybackStatus } from "@/serve/playback-status";
import {
  getOrCreatePlaybackFile,
} from "@/serve/transcode";
import { createVideoStreamResponse, resolveVideoPath } from "@/serve/video";
import { logMp4Serve } from "@/serve/playback-debug";

export async function handleVideoRequest(
  request: NextRequest,
  name: string,
  cat: string
): Promise<NextResponse | Response> {
  if (!cat || !resolveCategoryDir(cat)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (!(await isCategoryAccessible(cat))) {
    return NextResponse.json({ error: "Folder locked" }, { status: 403 });
  }

  const filePath = resolveVideoPath(name, cat);
  if (!filePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const statusOnly = request.nextUrl.searchParams.get("status") === "1";

  if (statusOnly) {
    return NextResponse.json(getPlaybackStatus(filePath));
  }

  let streamPath: string;
  try {
    streamPath = await getOrCreatePlaybackFile(filePath);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not prepare video for playback";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const range = request.headers.get("range");
  const isPreview = request.nextUrl.searchParams.get("preview") === "1";
  logMp4Serve(filePath, streamPath, range);
  return createVideoStreamResponse(streamPath, range, isPreview);
}
