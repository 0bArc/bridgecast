"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { SearchBar } from "@/components/search-bar";
import { BrandIcon } from "@/components/brand-icon";
import { SITE_NAME } from "@/lib/site";

type Props = {
  activeCat?: string;
  isAdmin?: boolean;
};

function NavbarSearch({ activeCat }: { activeCat: string }) {
  return (
    <Suspense
      fallback={
        <div className="w-full h-10 lg:h-9 rounded-lg glass-input animate-pulse" />
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
    <header className="sticky top-0 z-30 shrink-0 border-b border-white/[0.08] glass-panel safe-top">
      <div className="safe-x">
        <div className="flex items-center gap-2 sm:gap-3 min-h-14 pr-3 sm:pr-4 lg:pr-8">
          <Link
            href="/library"
            className="btn btn-ghost shadow-none text-base sm:text-lg font-semibold tracking-tight pl-0 pr-2 shrink-0 hover:bg-white/5 text-white gap-2 min-h-10"
          >
            <BrandIcon className="size-6 text-white" />
            <span>{SITE_NAME}</span>
          </Link>

          {onLibrary ? (
            <div className="hidden lg:flex flex-1 min-w-0 max-w-xl xl:max-w-2xl">
              <NavbarSearch activeCat={activeCat} />
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <nav className="flex items-center gap-0.5 shrink-0 ml-auto">
            {isAdmin ? (
              <Link
                href="/settings"
                className="btn btn-ghost btn-sm shadow-none font-normal text-base-content/65 hover:text-white hover:bg-white/5 px-2 sm:px-3"
              >
                Settings
              </Link>
            ) : null}
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="btn btn-ghost btn-sm shadow-none font-normal text-base-content/65 hover:text-white hover:bg-white/5 px-2 sm:px-3"
              >
                Logout
              </button>
            </form>
          </nav>
        </div>

        {onLibrary ? (
          <div className="lg:hidden pr-3 sm:pr-4 pb-3">
            <NavbarSearch activeCat={activeCat} />
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Sticky offset for content below the navbar (mobile search row included). */
export const NAVBAR_OFFSET_CLASS = "top-[6.75rem] lg:top-14";
