import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import {
  deleteCustomPoster,
  getOrCreateThumbnail,
  resolvePosterPath,
  saveCustomPoster,
} from "@/serve/poster";
import { resolveVideoPath } from "@/serve/video";

type Props = {
  params: Promise<{ name: string }>;
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_POSTER_BYTES = 8 * 1024 * 1024;

function resolveRequest(name: string, cat: string) {
  if (!cat || !resolveCategoryDir(cat)) {
    return { error: NextResponse.json({ error: "Invalid category" }, { status: 400 }) };
  }
  const filePath = resolveVideoPath(name, cat);
  if (!filePath) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { filePath, cat };
}

async function servePoster(filePath: string): Promise<NextResponse> {
  let thumb = resolvePosterPath(filePath);
  if (!thumb) {
    thumb = await getOrCreateThumbnail(filePath);
  }
  if (!thumb) {
    return new NextResponse(null, { status: 404 });
  }

  const stream = fs.createReadStream(thumb);
  const stat = fs.statSync(thumb);
  const custom = thumb.includes("_custom.");

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": custom
        ? "private, max-age=300"
        : "private, max-age=604800, immutable",
      "Content-Length": String(stat.size),
    },
  });
}

export async function GET(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = resolveRequest(name, cat);
  if ("error" in resolved) return resolved.error;

  if (!(await isCategoryAccessible(cat))) {
    return NextResponse.json({ error: "Folder locked" }, { status: 403 });
  }

  return servePoster(resolved.filePath);
}

export async function POST(request: NextRequest, { params }: Props) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = resolveRequest(name, cat);
  if ("error" in resolved) return resolved.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!IMAGE_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Use JPEG, PNG, or WebP" },
      { status: 400 }
    );
  }
  if (file.size > MAX_POSTER_BYTES) {
    return NextResponse.json({ error: "Max 8 MB" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  saveCustomPoster(resolved.filePath, buf);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Props) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";

  const resolved = resolveRequest(name, cat);
  if ("error" in resolved) return resolved.error;

  deleteCustomPoster(resolved.filePath);
  return NextResponse.json({ ok: true });
}
