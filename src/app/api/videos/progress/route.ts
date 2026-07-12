import { NextRequest, NextResponse } from "next/server";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import {
  clearPlaybackPosition,
  getPlaybackPosition,
  setPlaybackPosition,
} from "@/serve/playback-progress";
import { resolveVideoPath } from "@/serve/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveFile(cat: string, name: string) {
  if (!cat || !resolveCategoryDir(cat)) {
    return { error: NextResponse.json({ error: "Invalid category" }, { status: 400 }) };
  }
  if (!(await isCategoryAccessible(cat))) {
    return { error: NextResponse.json({ error: "Folder locked" }, { status: 403 }) };
  }
  const filePath = resolveVideoPath(decodeURIComponent(name), cat);
  if (!filePath) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { filePath };
}

export async function GET(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const name = request.nextUrl.searchParams.get("name") || "";
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const resolved = await resolveFile(cat, name);
  if ("error" in resolved && resolved.error) return resolved.error;

  const position = getPlaybackPosition(resolved.filePath!);
  return NextResponse.json({ position });
}

export async function PUT(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const name = request.nextUrl.searchParams.get("name") || "";
  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  const resolved = await resolveFile(cat, name);
  if ("error" in resolved && resolved.error) return resolved.error;

  let body: { position?: number; duration?: number | null; clear?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const filePath = resolved.filePath!;

  if (body.clear) {
    clearPlaybackPosition(filePath);
    return NextResponse.json({ ok: true, position: null });
  }

  if (typeof body.position !== "number" || !Number.isFinite(body.position)) {
    return NextResponse.json({ error: "Missing position" }, { status: 400 });
  }

  const duration =
    typeof body.duration === "number" && Number.isFinite(body.duration)
      ? body.duration
      : null;

  setPlaybackPosition(filePath, body.position, duration);
  return NextResponse.json({ ok: true, position: body.position });
}
