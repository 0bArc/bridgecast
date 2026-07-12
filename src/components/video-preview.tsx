"use client";

import { useEffect, useRef, useState } from "react";
import { isIosDevice } from "@/lib/client-device";
import { acquirePreviewSlot } from "@/lib/preview-queue";

type Props = {
  posterSrc: string;
  title: string;
  eager?: boolean;
};

const MAX_RETRIES = 8;

export function VideoPreview({ posterSrc, title, eager = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const [mounted, setMounted] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [posterOk, setPosterOk] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (eager) {
      setShouldLoad(true);
      return;
    }

    const el = rootRef.current;
    if (!el) return;

    // iOS Safari: IntersectionObserver with overflow scroll root is unreliable.
    const scrollRoot = isIosDevice()
      ? null
      : (el.closest("[data-library-scroll]") ?? el.closest("main") ?? null);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          io.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: "160px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [mounted, eager]);

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;
    void acquirePreviewSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }
      releaseRef.current = release;
    });

    return () => {
      cancelled = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [shouldLoad]);

  useEffect(() => {
    setPosterOk(false);
  }, [posterSrc, retry]);

  const imgSrc = retry > 0 ? `${posterSrc}&_r=${retry}` : posterSrc;

  return (
    <div
      ref={rootRef}
      className="relative aspect-video bg-base-300 overflow-hidden pointer-events-none select-none"
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-all duration-300 ${
            posterOk
              ? "opacity-70 scale-100 group-hover/card:opacity-100 group-hover/card:scale-105 group-active/card:opacity-100"
              : "opacity-100 scale-100"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-5 ml-0.5"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      <div
        className={`absolute inset-0 bg-base-300 animate-pulse transition-opacity duration-300 ${
          mounted && shouldLoad && posterOk ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      />

      {mounted && shouldLoad ? (
        <img
          key={imgSrc}
          src={imgSrc}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={`absolute inset-0 h-full w-full object-cover pointer-events-none transition-opacity duration-300 ${
            posterOk ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setPosterOk(true)}
          onError={() => {
            if (retry < MAX_RETRIES) {
              window.setTimeout(() => setRetry((n) => n + 1), 1500);
            }
          }}
        />
      ) : null}

      <span className="sr-only">{title}</span>
    </div>
  );
}
