import Link from "next/link";
import { Suspense } from "react";
import {
  LibrarySidebar,
  movieGridClassForCount,
  FOLDER_GRID_CLASS,
} from "@/components/library-sidebar";
import { MediaCard } from "@/components/media-card-loader";
import { Navbar, NAVBAR_OFFSET_CLASS } from "@/components/navbar";
import { NavIcon, categoryIcon } from "@/components/nav-icon";
import { VideoSort } from "@/components/video-sort";
import { isAdmin } from "@/lib/auth";
import {
  getUnlockedFolders,
  filterSidebarFolders,
  needsFolderUnlock,
} from "@/lib/folder-lock";
import { requireAuth, requireCategoryAccess } from "@/lib/guards";
import {
  breadcrumbParts,
  hasDirectVideos,
  listSubfolders,
  listTopLevel,
} from "@/serve/library";
import { getDisplayName } from "@/lib/display";
import { prewarmDurations } from "@/serve/duration-cache";
import { prewarmHls } from "@/serve/hls-manager";
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

function FolderGridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-8 opacity-45"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M4.5 3.75a1.5 1.5 0 00-1.5 1.5v14.25a1.5 1.5 0 001.5 1.5h15a1.5 1.5 0 001.5-1.5V5.25a1.5 1.5 0 00-1.5-1.5h-15zM9 6.75a.75.75 0 01.75-.75h.75v3h-.75A.75.75 0 019 9.75v-3zm4.5 0A.75.75 0 0114.25 6h.75v3h-.75a.75.75 0 01-.75-.75v-3zm-4.5 6.75a.75.75 0 01.75-.75h.75v3h-.75A.75.75 0 019 16.5v-3zm4.5 0a.75.75 0 01.75-.75h.75v3h-.75a.75.75 0 01-.75-.75v-3z"
        clipRule="evenodd"
      />
    </svg>
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
    <div className={movieGridClassForCount(items.length)}>
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
  const rawSubfolders = isSearch ? [] : listSubfolders(activeCat);
  // Home: show all top-level folders (locked ones link to unlock). Inside a folder: show subfolders — access already checked.
  const subfolders = isSearch ? [] : rawSubfolders;
  const sidebarTopLevel = filterSidebarFolders(topLevel);

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
    prewarmHls(paths.slice(0, 20));
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
      <Suspense fallback={<div className="min-h-14 glass-panel border-b animate-pulse" />}>
        <Navbar activeCat={activeCat} isAdmin={admin} />
      </Suspense>

      <div className="flex flex-1 min-h-0 w-full">
        <LibrarySidebar
          topLevel={sidebarTopLevel}
          activeCat={activeCat}
          isSearch={isSearch}
        />

        <main
          className="flex-1 min-w-0 overflow-y-auto scroll-smooth"
          data-library-scroll
        >
          <div
            className={`md:hidden overflow-x-auto border-b border-white/[0.06] glass-panel sticky ${NAVBAR_OFFSET_CLASS} z-10 safe-x`}
          >
            <div className="flex gap-2 py-2.5 w-max">
              <Link
                href="/library"
                className={`btn btn-sm rounded-full min-h-9 gap-1.5 ${
                  !activeCat && !isSearch
                    ? "bg-white/12 text-white border border-white/10"
                    : "btn-ghost border-0 text-white/70"
                }`}
              >
                <NavIcon
                  name="home"
                  className={
                    !activeCat && !isSearch ? "text-white" : "text-white/70"
                  }
                />
                Home
              </Link>
              {sidebarTopLevel.map((g) => {
                const top = g.id.split("/")[0];
                const active =
                  !isSearch &&
                  (activeCat === top || activeCat.startsWith(`${top}/`));
                const icon = categoryIcon(g.label, g.id);
                return (
                  <Link
                    key={g.id}
                    href={`/library?cat=${encodeURIComponent(top)}`}
                    className={`btn btn-sm rounded-full min-h-9 gap-1.5 ${
                      active
                        ? "bg-white/12 text-white border border-white/10"
                        : "btn-ghost border-0 text-white/70"
                    }`}
                  >
                    <NavIcon
                      name={icon}
                      className={active ? "text-white" : "text-white/70"}
                    />
                    {g.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-4 lg:p-10 pb-[max(2rem,var(--safe-bottom))] w-full">
            {!isSearch && activeCat ? (
              <nav
                aria-label="Breadcrumb"
                className="mb-5 overflow-x-auto max-w-full"
              >
                <ol className="flex items-center gap-2 flex-nowrap whitespace-nowrap text-sm">
                  <li>
                    <Link
                      href="/library"
                      className="text-white/85 hover:text-white transition-colors"
                    >
                      Library
                    </Link>
                  </li>
                  {crumbs.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span className="text-white/50 select-none" aria-hidden>
                        –
                      </span>
                      <Link
                        href={`/library?cat=${encodeURIComponent(c.id)}`}
                        className="text-white/85 hover:text-white transition-colors"
                      >
                        {getDisplayName(c.id)}
                      </Link>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <div className="flex items-end justify-between gap-3 mb-6 min-w-0">
              <h2 className="text-2xl lg:text-3xl font-semibold min-w-0 truncate tracking-tight">
                {currentLabel}
                {resultCount > 0 ? (
                  <span className="badge badge-neutral ml-3 bg-white/10 border-0 text-sm font-normal text-base-content/60">
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
              <div className={`${FOLDER_GRID_CLASS} mb-8`}>
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
                      className="glass-card p-4 flex h-[10.5rem] flex-col items-center justify-center text-center gap-2 hover:border-white/20 hover:bg-white/[0.06] transition-all duration-200 touch-manipulation relative"
                    >
                      {folder.locked && needsUnlock ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="size-3.5 absolute top-2.5 right-2.5 text-base-content/35"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                      <FolderGridIcon />
                      <div className="flex h-11 w-full items-center justify-center px-0.5">
                        <h3 className="font-semibold line-clamp-2 text-base leading-snug">
                          {folder.label}
                        </h3>
                      </div>
                      <span className="text-sm text-base-content/50 shrink-0">
                        {folder.videoCount}{" "}
                        {folder.videoCount === 1 ? "video" : "videos"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}

            {isSearch && searchResults.length > 0 ? (
              <div className={movieGridClassForCount(searchResults.length)}>
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
              <div className="alert glass-card border-0 text-base-content/70">
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
