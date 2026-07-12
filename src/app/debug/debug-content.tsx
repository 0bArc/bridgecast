import { notFound } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { WatchDebugShell } from "@/components/watch-debug-shell";
import { isAdmin } from "@/lib/auth";
import { formatVideoTitle } from "@/lib/display";
import { requireCategoryAccess } from "@/lib/guards";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveCategoryDir } from "@/serve/library";
import { getPlaybackStatus } from "@/serve/playback-status";
import { hlsPlaybackReady, resolveHlsDir } from "@/serve/hls-manager";
import {
  findCachedMp4,
  isIpadNative,
  needsPlaybackCache,
  playbackReady,
} from "@/serve/transcode";
import { getPlaybackPosition } from "@/serve/playback-progress";
import { resolveVideoPath } from "@/serve/video";

export const DEBUG_DEFAULT_NAME =
  "The Super Mario Galaxy Movie 2026 1080p Multi Webrip HEVC x265-RMTeam.mkv";
export const DEBUG_DEFAULT_CAT = "Children";

type Props = {
  cat: string;
  name: string;
};

export async function DebugWatchContent({ cat, name }: Props) {
  if (!resolveCategoryDir(cat)) notFound();

  await requireCategoryAccess(cat);
  if (!(await isCategoryAccessible(cat))) notFound();

  const filePath = resolveVideoPath(name, cat);
  if (!filePath) notFound();

  const admin = await isAdmin();
  const remux = needsPlaybackCache(filePath);
  const mustPrepare = remux && !playbackReady(filePath);
  const q = `cat=${encodeURIComponent(cat)}`;
  const nameQ = `name=${encodeURIComponent(name)}`;
  const src = remux
    ? `/api/videos/play?${q}&${nameQ}`
    : `/api/videos/${encodeURIComponent(name)}?${q}`;
  const hlsSrc = `/api/videos/hls?${q}&${nameQ}&file=playlist.m3u8`;
  const statusSrc = `/api/videos/status?${q}&${nameQ}`;
  const debugSrc = `/api/videos/debug?${q}&${nameQ}`;
  const progressApi = `/api/videos/progress?${q}&name=${encodeURIComponent(name)}`;
  const subtitlesApi = `/api/videos/${encodeURIComponent(name)}/subtitles?${q}`;
  const initialResumeAt = getPlaybackPosition(filePath);
  const status = getPlaybackStatus(filePath);

  const serverDebug = {
    filePath,
    remux,
    mp4Ready: playbackReady(filePath),
    hlsReady: hlsPlaybackReady(filePath),
    ipadNative: isIpadNative(filePath),
    cachedMp4: findCachedMp4(filePath),
    hlsDir: resolveHlsDir(filePath),
    src,
    hlsSrc,
    statusSrc,
    debugSrc,
    status,
  };

  return (
    <div className="h-dvh flex flex-col bg-black safe-top safe-bottom overflow-hidden">
      <Navbar isAdmin={admin} />
      <WatchDebugShell
        server={serverDebug}
        libraryQ={q}
        watchHref={`/watch/${encodeURIComponent(name)}?${q}`}
        player={{
          src,
          hlsSrc,
          statusSrc,
          title: formatVideoTitle(name),
          needsPrepare: mustPrepare,
          mimeType: remux ? "video/mp4" : undefined,
          subtitlesApi,
          progressApi,
          initialResumeAt,
        }}
      />
    </div>
  );
}
