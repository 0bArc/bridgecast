"use client";

import dynamic from "next/dynamic";

function MediaCardFallback() {
  return (
    <div className="h-full w-full">
      <div className="relative overflow-hidden rounded-lg ring-1 ring-white/10 aspect-video bg-base-300 animate-pulse" />
      <div className="pt-3 space-y-2">
        <div className="h-5 w-3/4 rounded bg-base-300 animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-base-300/80 animate-pulse" />
      </div>
    </div>
  );
}

export const MediaCard = dynamic(
  () => import("@/components/media-card").then((m) => m.MediaCard),
  {
    ssr: false,
    loading: MediaCardFallback,
  }
);

export type { Props as MediaCardProps } from "@/components/media-card";
