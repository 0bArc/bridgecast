"use client";

import { useEffect, useRef, useState } from "react";
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
  const [visible, setVisible] = useState(eager);
  const [canLoad, setCanLoad] = useState(eager);
  const [posterOk, setPosterOk] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (eager) return;
    const el = rootRef.current;
    if (!el) return;

    const scrollRoot =
      el.closest("[data-library-scroll]") ??
      el.closest("main") ??
      null;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: "120px", threshold: 0.01 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || canLoad) return;

    let cancelled = false;
    acquirePreviewSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }
      releaseRef.current = release;
      setCanLoad(true);
    });

    return () => {
      cancelled = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [visible, canLoad]);

  useEffect(() => {
    if (!canLoad) return;
    setPosterOk(false);

    const img = new Image();
    img.decoding = "async";
    img.onload = () => setPosterOk(true);
    img.onerror = () => {
      if (retry < MAX_RETRIES) {
        window.setTimeout(() => setRetry((n) => n + 1), 1500);
      }
    };
    img.src =
      retry > 0 ? `${posterSrc}&_r=${retry}` : posterSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [canLoad, posterSrc, retry]);

  return (
    <div
      ref={rootRef}
      className="relative aspect-video bg-base-300 overflow-hidden pointer-events-none select-none"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-all duration-300 ${
            posterOk ? "opacity-0 scale-90 group-hover/card:opacity-100 group-hover/card:scale-100" : "opacity-100 scale-100"
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

      {canLoad && posterOk ? (
        <img
          src={retry > 0 ? `${posterSrc}&_r=${retry}` : posterSrc}
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      ) : (
        <div className="absolute inset-0 bg-base-300 animate-pulse" />
      )}

      <span className="sr-only">{title}</span>
    </div>
  );
}
