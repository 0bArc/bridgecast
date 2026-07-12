import Link from "next/link";
import type { FolderItem } from "@/serve/library";

type Props = {
  topLevel: FolderItem[];
  activeCat: string;
  isSearch: boolean;
};

type NavIconName = "home" | "film" | "kids" | "learn" | "folder";

function NavIcon({ name }: { name: NavIconName }) {
  const cls = "size-5 shrink-0 opacity-80";
  switch (name) {
    case "home":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
        </svg>
      );
    case "film":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
        </svg>
      );
    case "kids":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94 1.01 1.616 1.948 1.856l1.036.258a.75.75 0 010 1.456l-1.036.258c-.938.24-1.712.916-1.948 1.856l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.948-1.856l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.948-1.856l.258-1.036A.75.75 0 0118 1.5z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "learn":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
          aria-hidden
        >
          <path d="M11.7 2.805a.75.75 0 01.6 0A60.65 60.65 0 0122.83 8.72a.75.75 0 01-.231 1.337 49.949 49.949 0 00-9.902 3.912l-.3.128a.75.75 0 01-.286 0 49.955 49.955 0 00-9.903-3.912.75.75 0 01-.231-1.337A60.653 60.653 0 0111.7 2.805z" />
          <path d="M13.5 10.5a.75.75 0 00-1.5 0v3.75a.75.75 0 001.5 0v-3.75zM11.25 15.75a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" />
          <path d="M3 20.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5H4.5a.75.75 0 01-.75-.75zm16.5 0a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5H20.25a.75.75 0 01-.75-.75z" />
        </svg>
      );
    default:
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={cls}
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
}

function categoryIcon(label: string, id: string): NavIconName {
  const key = `${label} ${id}`.toLowerCase();
  if (/(child|kid|family)/.test(key)) return "kids";
  if (/(develop|learn|tutorial|course|edu)/.test(key)) return "learn";
  if (/(action|movie|film|drama|horror|comedy|sci)/.test(key)) return "film";
  return "folder";
}

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
    <aside className="hidden md:flex flex-col w-52 lg:w-56 shrink-0 border-r border-white/[0.06] bg-base-100 overflow-y-auto sticky top-14 h-[calc(100dvh-3.5rem-var(--safe-top))]">
      <nav className="flex flex-col gap-0.5 px-4 lg:px-5 py-6">
        <Link href="/library" className={navLinkClass(homeActive)}>
          <NavIcon name="home" />
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
              <NavIcon name={categoryIcon(g.label, g.id)} />
              <span className="min-w-0 truncate">{g.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export const FOLDER_GRID_CLASS =
  "grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 items-start max-w-5xl";

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
