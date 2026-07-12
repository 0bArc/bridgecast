"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { SearchBar } from "@/components/search-bar";
import { SITE_NAME } from "@/lib/site";

type Props = {
  activeCat?: string;
  isAdmin?: boolean;
};

function NavbarSearch({ activeCat }: { activeCat: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 min-w-0 max-w-3xl h-8 rounded-btn bg-base-100 border border-base-content/20 animate-pulse" />
      }
    >
      <SearchBar activeCat={activeCat} />
    </Suspense>
  );
}

export function Navbar({ activeCat = "", isAdmin = false }: Props) {
  const pathname = usePathname();
  const onLibrary = pathname.startsWith("/library");

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-base-300 bg-base-200 safe-top">
      <div className="flex items-center gap-3 min-h-14 px-4 lg:px-6 safe-x">
        <Link
          href="/library"
          className="btn btn-ghost shadow-none text-lg font-bold tracking-tight px-2 shrink-0"
        >
          {SITE_NAME}
        </Link>

        {onLibrary ? <NavbarSearch activeCat={activeCat} /> : <div className="flex-1" />}

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {isAdmin ? (
            <Link
              href="/settings"
              className="btn btn-ghost btn-sm shadow-none font-normal"
            >
              Settings
            </Link>
          ) : null}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="btn btn-ghost btn-sm shadow-none font-normal"
            >
              Logout
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
