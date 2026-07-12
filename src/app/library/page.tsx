import Link from "next/link";
import { Suspense } from "react";
import { MediaCard } from "@/components/media-card";
import { VideoSort } from "@/components/video-sort";
import { Navbar } from "@/components/navbar";
import { isAdmin } from "@/lib/auth";
import { getUnlockedFolders, needsFolderUnlock } from "@/lib/folder-lock";
import { requireAuth, requireCategoryAccess } from "@/lib/guards";
import {
  breadcrumbParts,
  hasDirectVideos,
  listSubfolders,
  listTopLevel,
} from "@/serve/library";
import { getDisplayName } from "@/lib/display";
import { prewarmDurations } from "@/serve/duration-cache";
import { prewarmThumbnails } from "@/serve/poster";
import { searchVideos, type SearchResult } from "@/serve/search";
import { getVideoMeta } from "@/serve/video-meta";
import {
  listVideos,
  parseVideoSort,
  resolveVideoPath,
  sortVideos,
  type VideoItem,
} from "@/serve/video";

type Props = {
  searchParams: Promise<{ cat?: string; sort?: string; q?: string }>;
};

function FolderIcon({ locked }: { locked?: boolean }) {
  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="size-10 opacity-50"
        aria-hidden
      >
        <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.5a3 3 0 013-3h5.25a3 3 0 013 3v.75H1.5v-.75z" />
      </svg>
      {locked ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-4 absolute -bottom-0.5 -right-0.5 text-warning"
          aria-label="Locked"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
    </div>
  );
}

function VideoGrid({
  items,
  categoryId,
  isAdmin,
  getHref,
  getPoster,
  getKey,
}: {
  items: VideoItem[];
  categoryId: string;
  isAdmin: boolean;
  getHref: (item: VideoItem, index: number) => string;
  getPoster: (item: VideoItem) => string;
  getKey: (item: VideoItem) => string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
      {items.map((video, index) => {
        const meta = getVideoMeta(video.name, categoryId);
        return (
          <MediaCard
            key={getKey(video)}
            href={getHref(video, index)}
            posterSrc={getPoster(video)}
            title={meta.title}
            year={meta.year}
            durationLabel={meta.durationLabel}
            sizeLabel={video.sizeLabel}
            isAdmin={isAdmin}
            videoName={video.name}
            categoryId={categoryId}
            eager={index < 6}
          />
        );
      })}
    </div>
  );
}

export default async function LibraryPage({ searchParams }: Props) {
  await requireAuth();
  const admin = await isAdmin();

  const { cat: activeCat = "", sort: sortParam, q: query = "" } =
    await searchParams;
  const sort = parseVideoSort(sortParam);
  const isSearch = query.trim().length > 0;

  if (!isSearch) {
    await requireCategoryAccess(activeCat);
  }

  const unlocked = await getUnlockedFolders();
  const topLevel = listTopLevel();
  const subfolders = isSearch ? [] : listSubfolders(activeCat);

  let videos: VideoItem[] = [];
  let searchResults: SearchResult[] = [];

  if (isSearch) {
    searchResults = sortVideos(
      searchVideos(query, unlocked),
      sort
    ) as SearchResult[];
  } else if (hasDirectVideos(activeCat)) {
    videos = sortVideos(listVideos(activeCat), sort);
    const paths = videos
      .map((v) => resolveVideoPath(v.name, activeCat))
      .filter((p): p is string => !!p);
    prewarmThumbnails(paths);
    prewarmDurations(paths);
  }

  const crumbs = breadcrumbParts(activeCat);
  const currentLabel = isSearch
    ? `Search: ${query.trim()}`
    : activeCat
      ? getDisplayName(activeCat)
      : "Library";

  const resultCount = isSearch ? searchResults.length : videos.length;

  return (
    <div className="min-h-dvh flex flex-col bg-base-100">
      <Suspense fallback={<div className="min-h-14 bg-base-200 border-b border-base-300" />}>
        <Navbar activeCat={activeCat} isAdmin={admin} />
      </Suspense>

      <div className="flex flex-1 min-h-0 w-full">
        <aside className="hidden md:flex flex-col w-56 lg:w-64 shrink-0 border-r border-base-300 bg-base-200/60 overflow-y-auto sticky top-14 h-[calc(100dvh-3.5rem-var(--safe-top))]">
          <p className="text-[11px] uppercase tracking-wider opacity-40 px-5 pt-4 pb-2 font-medium">
            Library
          </p>
          <ul className="menu menu-sm px-3 pb-4 gap-0.5 flex-1">
            <li>
              <Link
                href="/library"
                className={!activeCat && !isSearch ? "active" : ""}
              >
                Home
              </Link>
            </li>
            {topLevel.map((g) => {
              const top = g.id.split("/")[0];
              const isActive =
                !isSearch &&
                (activeCat === top || activeCat.startsWith(`${top}/`));
              const needsUnlock = needsFolderUnlock(top, unlocked);
              const href = needsUnlock
                ? `/folder-unlock?cat=${encodeURIComponent(top)}`
                : `/library?cat=${encodeURIComponent(top)}`;
              return (
                <li key={g.id}>
                  <Link href={href} className={isActive ? "active" : ""}>
                    <span className="truncate">{g.label}</span>
                    {g.locked ? (
                      <span className="text-warning text-xs">🔒</span>
                    ) : null}
                    <span className="badge badge-xs">{g.videoCount}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <main
          className="flex-1 min-w-0 overflow-y-auto scroll-smooth"
          data-library-scroll
        >
          <div className="md:hidden overflow-x-auto border-b border-base-300 bg-base-200/80 sticky top-14 z-10 safe-x">
            <div className="flex gap-2 py-3 w-max">
              <Link
                href="/library"
                className={`btn btn-sm ${!activeCat && !isSearch ? "btn-primary" : "btn-ghost"}`}
              >
                Library
              </Link>
              {topLevel.map((g) => {
                const top = g.id.split("/")[0];
                const needsUnlock = needsFolderUnlock(top, unlocked);
                const href = needsUnlock
                  ? `/folder-unlock?cat=${encodeURIComponent(top)}`
                  : `/library?cat=${encodeURIComponent(top)}`;
                return (
                  <Link
                    key={g.id}
                    href={href}
                    className={`btn btn-sm ${
                      !isSearch &&
                      (activeCat === top || activeCat.startsWith(`${top}/`))
                        ? "btn-primary"
                        : "btn-ghost"
                    }`}
                  >
                    {g.label}
                    {g.locked ? " 🔒" : ""}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-4 lg:p-6 pb-[max(2rem,var(--safe-bottom))] w-full">
            {!isSearch ? (
              <div className="text-sm breadcrumbs mb-4 overflow-x-auto max-w-full">
                <ul className="flex-nowrap whitespace-nowrap">
                  <li>
                    <Link href="/library">Library</Link>
                  </li>
                {crumbs.map((c) => (
                  <li key={c.id}>
                    <Link href={`/library?cat=${encodeURIComponent(c.id)}`}>
                      {getDisplayName(c.id)}
                    </Link>
                  </li>
                ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 mb-4 min-w-0">
              <h2 className="text-lg font-semibold min-w-0 truncate">
                {currentLabel}
                {resultCount > 0 ? (
                  <span className="badge badge-neutral ml-2">
                    {resultCount}
                  </span>
                ) : null}
              </h2>
              {resultCount > 0 ? (
                <Suspense fallback={null}>
                  <VideoSort
                    cat={activeCat}
                    sort={sort}
                    query={isSearch ? query.trim() : undefined}
                  />
                </Suspense>
              ) : null}
            </div>

            {!isSearch && subfolders.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 lg:gap-4 mb-6">
                {subfolders.map((folder) => {
                  const needsUnlock = needsFolderUnlock(folder.id, unlocked);
                  const href = needsUnlock
                    ? `/folder-unlock?cat=${encodeURIComponent(folder.id)}`
                    : `/library?cat=${encodeURIComponent(folder.id)}`;
                  return (
                    <Link
                      key={folder.id}
                      href={href}
                      prefetch={false}
                      className="card card-border bg-base-200 hover:bg-base-300 active:bg-base-300 transition-colors block touch-manipulation"
                    >
                      <div className="card-body p-4 items-center text-center gap-2">
                        <FolderIcon locked={folder.locked} />
                        <h3 className="font-medium line-clamp-2">
                          {folder.label}
                        </h3>
                        <span className="badge badge-neutral badge-sm">
                          {folder.videoCount} videos
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {isSearch && searchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
                {searchResults.map((video, index) => {
                  const catQ = `cat=${encodeURIComponent(video.categoryId)}`;
                  const meta = getVideoMeta(video.name, video.categoryId);
                  return (
                    <MediaCard
                      key={`${video.categoryId}/${video.name}`}
                      href={`/watch/${encodeURIComponent(video.name)}?${catQ}`}
                      posterSrc={`/api/videos/${encodeURIComponent(video.name)}/poster?${catQ}`}
                      title={meta.title}
                      year={meta.year}
                      durationLabel={meta.durationLabel}
                      sizeLabel={video.sizeLabel}
                      categoryLabel={video.categoryLabel}
                      isAdmin={admin}
                      videoName={video.name}
                      categoryId={video.categoryId}
                      eager={index < 6}
                    />
                  );
                })}
              </div>
            ) : null}

            {!isSearch && videos.length > 0 ? (
              <VideoGrid
                items={videos}
                categoryId={activeCat}
                isAdmin={admin}
                getKey={(v) => v.name}
                getHref={(video) => {
                  const catQ = `cat=${encodeURIComponent(activeCat)}`;
                  return `/watch/${encodeURIComponent(video.name)}?${catQ}`;
                }}
                getPoster={(video) => {
                  const catQ = `cat=${encodeURIComponent(activeCat)}`;
                  return `/api/videos/${encodeURIComponent(video.name)}/poster?${catQ}`;
                }}
              />
            ) : null}

            {resultCount === 0 && subfolders.length === 0 ? (
              <div className="alert">
                <span>
                  {isSearch
                    ? `No videos matching "${query.trim()}"`
                    : activeCat
                      ? "No videos in this folder yet"
                      : "Add folders with videos under your library path"}
                </span>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
