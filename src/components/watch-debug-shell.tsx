"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentProps } from "react";
import {
  WatchDebugPanel,
  type ClientPlaybackDebug,
} from "@/components/watch-debug-panel";
import { WatchPlayer } from "@/components/watch-player";

type ServerDebug = ComponentProps<typeof WatchDebugPanel>["server"];
type PlayerProps = ComponentProps<typeof WatchPlayer>;

type Props = {
  server: ServerDebug;
  watchHref: string;
  libraryQ: string;
  player: PlayerProps;
};

export function WatchDebugShell({
  server,
  watchHref,
  libraryQ,
  player,
}: Props) {
  const [client, setClient] = useState<ClientPlaybackDebug | null>(null);

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <WatchDebugPanel server={server} client={client} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="safe-x px-4 py-2.5 shrink-0 border-b border-white/[0.06] flex items-center justify-between gap-3">
          <Link
            href={`/library?${libraryQ}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-base-content/70 hover:text-white transition-colors"
          >
            ← Back to library
          </Link>
          <Link
            href={watchHref}
            className="text-xs text-white/50 hover:text-white font-mono truncate"
          >
            /watch
          </Link>
        </div>

        <div className="flex-1 min-h-0 w-full p-2 safe-x flex flex-col">
          <WatchPlayer {...player} onDebugUpdate={setClient} />
        </div>
      </div>
    </div>
  );
}
