"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { VideoPlayer as VideoPlayerType } from "@/components/video-player";

const VideoPlayer = dynamic(
  () => import("@/components/video-player").then((m) => m.VideoPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-black rounded-lg">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    ),
  }
);

type Props = ComponentProps<typeof VideoPlayerType>;

export function WatchPlayer(props: Props) {
  return <VideoPlayer {...props} />;
}
