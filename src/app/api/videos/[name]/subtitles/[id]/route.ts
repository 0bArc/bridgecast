import { NextRequest, NextResponse } from "next/server";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import { readSubtitle } from "@/serve/subtitles";
import { resolveVideoPath } from "@/serve/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ name: string; id: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  const { name: encoded, id: trackId } = await params;
  const name = decodeURIComponent(encoded);
  const id = decodeURIComponent(trackId);
  const cat = request.nextUrl.searchParams.get("cat") || "";

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

  const content = readSubtitle(filePath, id);
  if (!content) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/x-subrip; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
