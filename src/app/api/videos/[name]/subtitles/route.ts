import { NextRequest, NextResponse } from "next/server";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import {
  calibrateSubtitleTrack,
  deleteSubtitle,
  listSubtitles,
  resyncSubtitle,
  saveSubtitle,
  setSubtitleOffset,
} from "@/serve/subtitles";
import { resolveVideoPath } from "@/serve/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ name: string }>;
};

async function resolveVideo(name: string, cat: string) {
  if (!cat || !resolveCategoryDir(cat)) {
    return { error: NextResponse.json({ error: "Invalid category" }, { status: 400 }) };
  }
  if (!(await isCategoryAccessible(cat))) {
    return { error: NextResponse.json({ error: "Folder locked" }, { status: 403 }) };
  }
  const filePath = resolveVideoPath(name, cat);
  if (!filePath) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { filePath };
}

export async function GET(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = await resolveVideo(name, cat);
  if ("error" in resolved && resolved.error) return resolved.error;

  return NextResponse.json({ tracks: listSubtitles(resolved.filePath!) });
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = await resolveVideo(name, cat);
  if ("error" in resolved && resolved.error) return resolved.error;

  const body = (await request.json()) as {
    id?: string;
    offset?: number;
    resync?: boolean;
    calibrate?: boolean;
  };
  if (!body.id) {
    return NextResponse.json({ error: "Missing subtitle id" }, { status: 400 });
  }

  const filePath = resolved.filePath!;
  if (body.calibrate) {
    const calibration = calibrateSubtitleTrack(filePath, body.id);
    return NextResponse.json({
      id: body.id,
      calibration,
      tracks: listSubtitles(filePath),
    });
  }

  let offset = 0;
  if (body.resync) {
    offset = resyncSubtitle(filePath, body.id);
  } else if (typeof body.offset === "number") {
    offset = setSubtitleOffset(filePath, body.id, body.offset);
  } else {
    return NextResponse.json({ error: "Missing offset or resync flag" }, { status: 400 });
  }

  return NextResponse.json({
    id: body.id,
    offset,
    tracks: listSubtitles(filePath),
  });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = await resolveVideo(name, cat);
  if ("error" in resolved && resolved.error) return resolved.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".srt")) {
    return NextResponse.json({ error: "Only .srt files are supported" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  try {
    const content = await file.text();
    const track = saveSubtitle(resolved.filePath!, file.name, content);
    return NextResponse.json({ track, tracks: listSubtitles(resolved.filePath!) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const id = request.nextUrl.searchParams.get("id") || "";

  const resolved = await resolveVideo(name, cat);
  if ("error" in resolved && resolved.error) return resolved.error;
  if (!id) {
    return NextResponse.json({ error: "Missing subtitle id" }, { status: 400 });
  }

  if (!deleteSubtitle(resolved.filePath!, id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ tracks: listSubtitles(resolved.filePath!) });
}
