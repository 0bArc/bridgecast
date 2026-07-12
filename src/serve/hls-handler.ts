import { NextRequest } from "next/server";
import {
  hlsAssetCacheControl,
  hlsAssetContentType,
  hlsAssetEtag,
  openHlsAssetStream,
} from "@/serve/hls";
import { ensureHlsStartup, hlsManager } from "@/serve/hls-manager";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import { needsRemux } from "@/serve/transcode";
import { resolveVideoPath } from "@/serve/video";

type HlsRequestParams = {
  cat: string;
  name: string;
  file: string;
  statusOnly: boolean;
};

function buildBaseUrl(cat: string, name: string): string {
  const q = `cat=${encodeURIComponent(cat)}&name=${encodeURIComponent(name)}`;
  return `/api/videos/hls?${q}&file=`;
}

async function resolveVideo(cat: string, name: string) {
  if (!cat || !resolveCategoryDir(cat)) {
    return { error: Response.json({ error: "Invalid category" }, { status: 400 }) };
  }
  if (!(await isCategoryAccessible(cat))) {
    return { error: Response.json({ error: "Folder locked" }, { status: 403 }) };
  }

  const filePath = resolveVideoPath(decodeURIComponent(name), cat);
  if (!filePath) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }

  if (!needsRemux(filePath)) {
    return { error: Response.json({ error: "HLS not required" }, { status: 400 }) };
  }

  return { filePath };
}

export async function handleHlsRequest(
  request: NextRequest,
  params: HlsRequestParams
): Promise<Response> {
  ensureHlsStartup();
  const { cat, name, file, statusOnly } = params;

  if (!name) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }

  const resolved = await resolveVideo(cat, name);
  if ("error" in resolved && resolved.error) return resolved.error;

  const filePath = resolved.filePath!;
  const status = hlsManager.getStatus(filePath);

  if (statusOnly) {
    return Response.json({
      ready: status.ready,
      preparing: status.preparing || status.packaging,
      viewers: status.viewers,
    });
  }

  const isPlaylist = file.endsWith(".m3u8");

  if (isPlaylist) {
    hlsManager.registerViewer(filePath);

    if (!status.ready) {
      try {
        await hlsManager.prepare(filePath);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not prepare HLS";
        return Response.json({ error: message }, { status: 503 });
      }
    }
  } else {
    hlsManager.touchViewer(filePath);
    if (!status.ready) {
      return Response.json(
        { error: "HLS not ready — request playlist first" },
        { status: 503 }
      );
    }
  }

  const hlsDir = hlsManager.resolveDir(filePath);
  if (!hlsDir) {
    return Response.json({ error: "HLS cache missing" }, { status: 503 });
  }

  const baseUrl = buildBaseUrl(cat, name);

  if (isPlaylist) {
    const playlist = hlsManager.getPlaylistContent(filePath, baseUrl);
    if (!playlist) {
      return Response.json({ error: "Playlist not found" }, { status: 404 });
    }
    return new Response(playlist, {
      headers: {
        "Content-Type": hlsAssetContentType(file),
        "Cache-Control": hlsAssetCacheControl(file),
        Vary: "Accept-Encoding",
      },
    });
  }

  const range = request.headers.get("range");
  const ifNoneMatch = request.headers.get("if-none-match");
  const opened = openHlsAssetStream(hlsDir, file, range);

  if (!opened) {
    return Response.json({ error: "Segment not found" }, { status: 404 });
  }

  const etag = hlsAssetEtag(opened.stat);
  if (ifNoneMatch === etag) {
    opened.stream.destroy();
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const headers: Record<string, string> = {
    "Content-Type": hlsAssetContentType(file),
    "Cache-Control": hlsAssetCacheControl(file),
    ETag: etag,
    "Accept-Ranges": "bytes",
  };

  if (range) {
    headers["Content-Range"] = `bytes ${opened.start}-${opened.end}/${opened.stat.size}`;
    headers["Content-Length"] = String(opened.end - opened.start + 1);
    return new Response(opened.stream as unknown as BodyInit, {
      status: 206,
      headers,
    });
  }

  headers["Content-Length"] = String(opened.stat.size);
  return new Response(opened.stream as unknown as BodyInit, { headers });
}
