import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { WatchPlayer } from "@/components/watch-player";
import { isAdmin } from "@/lib/auth";
import { resolveCategoryDir } from "@/serve/library";
import { requireCategoryAccess } from "@/lib/guards";
import { isCategoryAccessible } from "@/lib/folder-lock";
import { resolveVideoPath } from "@/serve/video";
import { needsPlaybackCache, playbackReady } from "@/serve/transcode";
import { getPlaybackPosition } from "@/serve/playback-progress";
import { formatVideoTitle } from "@/lib/display";

type Props = {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ cat?: string }>;
};

export default async function WatchPage({ params, searchParams }: Props) {
  const { name: encoded } = await params;
  const { cat } = await searchParams;
  if (!cat || !resolveCategoryDir(cat)) notFound();

  await requireCategoryAccess(cat);
  if (!(await isCategoryAccessible(cat))) notFound();

  const name = decodeURIComponent(encoded);
  const filePath = resolveVideoPath(name, cat);
  if (!filePath) notFound();

  const admin = await isAdmin();
  const q = `cat=${encodeURIComponent(cat)}`;
  const remux = needsPlaybackCache(filePath);
  const mustPrepare = remux && !playbackReady(filePath);
  const src = remux
    ? `/api/videos/play?${q}&name=${encodeURIComponent(name)}`
    : `/api/videos/${encodeURIComponent(name)}?${q}`;
  const hlsSrc = remux
    ? `/api/videos/hls?${q}&name=${encodeURIComponent(name)}&file=playlist.m3u8`
    : "";
  const statusSrc = remux
    ? `/api/videos/status?${q}&name=${encodeURIComponent(name)}`
    : "";
  const progressApi = `/api/videos/progress?${q}&name=${encodeURIComponent(name)}`;
  const initialResumeAt = getPlaybackPosition(filePath);
  const subtitlesApi = `/api/videos/${encodeURIComponent(name)}/subtitles?${q}`;

  return (
    <div className="h-dvh flex flex-col bg-black safe-top safe-bottom overflow-hidden">
      <Navbar isAdmin={admin} />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="safe-x px-4 py-2 shrink-0">
          <p className="truncate text-sm font-medium">
            {formatVideoTitle(name)}
          </p>
        </div>

        <div className="flex-1 min-h-0 w-full p-2 safe-x flex flex-col">
          <WatchPlayer
            src={src}
            hlsSrc={hlsSrc}
            statusSrc={statusSrc}
            title={formatVideoTitle(name)}
            needsPrepare={mustPrepare}
            mimeType={remux ? "video/mp4" : undefined}
            subtitlesApi={subtitlesApi}
            progressApi={progressApi}
            initialResumeAt={initialResumeAt}
          />
        </div>

        <div className="safe-x px-4 pb-4 shrink-0">
          <Link href={`/library?${q}`} className="btn btn-ghost btn-sm">
            ← Back to library
          </Link>
        </div>
      </div>
    </div>
  );
}
