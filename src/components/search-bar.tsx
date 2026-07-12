"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type SearchHit = {
  name: string;
  title: string;
  year?: number | null;
  durationLabel?: string;
  categoryId: string;
  categoryLabel: string;
  sizeLabel: string;
  poster: string;
  href: string;
};

type Props = {
  activeCat?: string;
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SearchBar({ activeCat = "" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentQ = searchParams.get("q") || "";
  const [query, setQuery] = useState(currentQ);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState(0);

  const debouncedQuery = useDebouncedValue(query.trim(), 200);

  useEffect(() => {
    setQuery(currentQ);
  }, [currentQ]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
          { credentials: "include" }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as {
          results?: SearchHit[];
          total?: number;
        };
        if (cancelled) return;
        setResults(data.results ?? []);
        setTotal(data.total ?? 0);
        setOpen(true);
      } catch {
        if (!cancelled) {
          setResults([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const goToFullSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      else if (activeCat) params.set("cat", activeCat);
      const sort = searchParams.get("sort");
      if (sort) params.set("sort", sort);
      setOpen(false);
      router.push(`/library${params.size ? `?${params}` : ""}`);
    },
    [activeCat, router, searchParams]
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    goToFullSearch(query);
  }

  const showDropdown =
    open && query.trim().length >= 2 && (loading || results.length > 0 || total === 0);

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0 max-w-3xl">
      <form onSubmit={onSubmit}>
        <label className="input input-bordered input-sm flex items-center gap-2 w-full bg-base-100 shadow-none">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="size-4 opacity-40 shrink-0"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            className="grow min-w-0 bg-transparent outline-none"
            placeholder="Search movies…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length >= 2) setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Search movies"
          />
          {query ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square shrink-0 shadow-none opacity-60"
              onClick={() => {
                setQuery("");
                setOpen(false);
                router.push("/library");
              }}
              aria-label="Clear search"
            >
              ✕
            </button>
          ) : null}
        </label>
      </form>

      {showDropdown ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 rounded-xl border border-base-content/10 bg-base-300 shadow-2xl overflow-hidden"
        >
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm opacity-60">
              <span className="loading loading-spinner loading-sm" />
              Searching…
            </div>
          ) : null}

          {!loading && results.length === 0 ? (
            <div className="px-4 py-5 text-sm opacity-60 text-center">
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : null}

          {results.length > 0 ? (
            <ul className="max-h-[min(70dvh,22rem)] overflow-y-auto py-1">
              {results.map((hit) => (
                <li key={`${hit.categoryId}/${hit.name}`}>
                  <Link
                    href={hit.href}
                    prefetch={false}
                    role="option"
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-base-100 active:bg-base-100 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <div className="relative size-14 shrink-0 rounded-md overflow-hidden bg-base-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hit.poster}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{hit.title}</p>
                      <p className="text-xs opacity-50 truncate">
                        {[hit.year, hit.durationLabel, hit.categoryLabel]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="text-[11px] opacity-40 tabular-nums shrink-0">
                      {hit.sizeLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {total > results.length ? (
            <button
              type="button"
              className="w-full border-t border-base-content/10 px-4 py-3 text-sm text-center hover:bg-base-100 transition-colors"
              onClick={() => goToFullSearch(query)}
            >
              See all {total} results
            </button>
          ) : total > 0 && results.length > 0 ? (
            <button
              type="button"
              className="w-full border-t border-base-content/10 px-4 py-2.5 text-xs text-center opacity-60 hover:bg-base-100 hover:opacity-100 transition-colors"
              onClick={() => goToFullSearch(query)}
            >
              View in library
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
