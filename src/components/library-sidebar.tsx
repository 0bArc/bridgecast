import Link from "next/link";
import type { FolderItem } from "@/serve/library";
import { NavIcon, categoryIcon } from "@/components/nav-icon";

type Props = {
  topLevel: FolderItem[];
  activeCat: string;
  isSearch: boolean;
};

function navLinkClass(active: boolean): string {
  return [
    "flex items-center gap-3 rounded-md px-1 py-2.5 text-base font-medium leading-tight transition-colors",
    active
      ? "text-white"
      : "text-white/55 hover:text-white/90 hover:bg-white/[0.04]",
  ].join(" ");
}

export function LibrarySidebar({
  topLevel,
  activeCat,
  isSearch,
}: Omit<Props, "unlocked">) {
  const homeActive = !activeCat && !isSearch;

  return (
    <aside className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 border-r border-white/[0.06] bg-base-100 overflow-y-auto sticky top-[6.75rem] lg:top-14 h-[calc(100dvh-6.75rem-var(--safe-top))] lg:h-[calc(100dvh-3.5rem-var(--safe-top))]">
      <nav className="flex flex-col gap-0.5 px-4 lg:px-5 py-6">
        <Link href="/library" className={navLinkClass(homeActive)}>
          <NavIcon name="home" className={homeActive ? "text-white" : "text-white/75"} />
          <span>Home</span>
        </Link>

        {topLevel.map((g) => {
          const top = g.id.split("/")[0];
          const isActive =
            !isSearch && (activeCat === top || activeCat.startsWith(`${top}/`));

          return (
            <Link
              key={g.id}
              href={`/library?cat=${encodeURIComponent(top)}`}
              className={navLinkClass(isActive)}
              title={g.label}
            >
              <NavIcon
                name={categoryIcon(g.label, g.id)}
                className={isActive ? "text-white" : "text-white/75"}
              />
              <span className="min-w-0 truncate">{g.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export const FOLDER_GRID_CLASS =
  "grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 items-stretch max-w-5xl";

export const MOVIE_GRID_CLASS =
  "grid gap-x-6 gap-y-10 justify-items-start w-full";

export function movieGridClass(count: number): string {
  const cardFill = "[&>*]:w-full [&>*]:max-w-none";
  if (count <= 1) {
    return `${MOVIE_GRID_CLASS} grid-cols-1 [&>*]:w-full [&>*]:max-w-md`;
  }
  if (count === 2) {
    return `${MOVIE_GRID_CLASS} grid-cols-1 sm:grid-cols-2 max-w-5xl ${cardFill}`;
  }
  if (count <= 4) {
    return `${MOVIE_GRID_CLASS} grid-cols-1 min-[520px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${cardFill}`;
  }
  return `${MOVIE_GRID_CLASS} grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 ${cardFill}`;
}

export function movieGridClassForCount(count: number): string {
  return movieGridClass(count);
}
