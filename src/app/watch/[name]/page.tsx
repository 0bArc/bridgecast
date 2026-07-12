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
  const remux = needsPlaybackCache(filePath);
  const mustPrepare = remux && !playbackReady(filePath);
  const q = `cat=${encodeURIComponent(cat)}`;
  const nameQ = `name=${encodeURIComponent(name)}`;
  const src = remux
    ? `/api/videos/play?${q}&${nameQ}`
    : `/api/videos/${encodeURIComponent(name)}?${q}`;
  const hlsSrc = `/api/videos/hls?${q}&${nameQ}&file=playlist.m3u8`;
  const statusSrc = `/api/videos/status?${q}&${nameQ}`;
  const progressApi = `/api/videos/progress?${q}&name=${encodeURIComponent(name)}`;
  const initialResumeAt = getPlaybackPosition(filePath);
  const subtitlesApi = `/api/videos/${encodeURIComponent(name)}/subtitles?${q}`;

  return (
    <div className="h-dvh flex flex-col bg-black safe-top safe-bottom overflow-hidden">
      <Navbar isAdmin={admin} />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="safe-x px-4 py-2.5 shrink-0 border-b border-white/[0.06]">
          <Link
            href={`/library?${q}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-base-content/70 hover:text-white transition-colors touch-manipulation"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="size-4 shrink-0 opacity-80"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
                clipRule="evenodd"
              />
            </svg>
            Back to library
          </Link>
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
      </div>
    </div>
  );
}
