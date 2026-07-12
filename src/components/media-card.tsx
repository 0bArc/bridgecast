"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { VideoPreview } from "@/components/video-preview";

type Props = {
  href: string;
  posterSrc: string;
  title: string;
  year?: number | null;
  durationLabel?: string;
  sizeLabel: string;
  categoryLabel?: string;
  isAdmin?: boolean;
  videoName: string;
  categoryId: string;
  eager?: boolean;
};

export function MediaCard({
  href,
  posterSrc,
  title,
  year,
  durationLabel,
  sizeLabel,
  categoryLabel,
  isAdmin = false,
  videoName,
  categoryId,
  eager = false,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const openMenuRef = useRef<(x: number, y: number) => void>(() => {});
  const [poster, setPoster] = useState(posterSrc);
  const [uploading, setUploading] = useState(false);

  const posterApi = `/api/videos/${encodeURIComponent(videoName)}/poster?cat=${encodeURIComponent(categoryId)}`;

  async function uploadPoster(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(posterApi, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Upload failed");
      }
      setPoster(`${posterApi}&v=${Date.now()}`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function resetPoster() {
    setUploading(true);
    try {
      const res = await fetch(posterApi, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Reset failed");
      setPoster(`${posterApi}&v=${Date.now()}`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setUploading(false);
    }
  }

  const menuItems: ContextMenuItem[] = [
    {
      id: "play",
      label: "Play",
      onClick: () => router.push(href),
    },
  ];

  if (isAdmin) {
    menuItems.push(
      {
        id: "poster",
        label: uploading ? "Uploading…" : "Change poster",
        disabled: uploading,
        onClick: () => fileRef.current?.click(),
      },
      {
        id: "reset-poster",
        label: "Reset poster",
        disabled: uploading,
        onClick: () => void resetPoster(),
      }
    );
  }

  const metaParts = [year ? String(year) : null, durationLabel || null].filter(
    Boolean
  );

  return (
    <ContextMenu
      items={menuItems}
      className="relative h-full group/card"
      onReady={(openAt) => {
        openMenuRef.current = openAt;
      }}
    >
      <Link
        href={href}
        prefetch={false}
        className="block touch-manipulation h-full w-full outline-none"
      >
        <div className="relative overflow-hidden rounded-lg ring-1 ring-white/10 transition duration-300 group-hover/card:ring-white/25 group-hover/card:shadow-xl group-hover/card:shadow-black/50 group-focus-visible/card:ring-white/30">
          <div className="transition duration-300 group-hover/card:scale-[1.03]">
            <VideoPreview posterSrc={poster} title={title} eager={eager} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none opacity-80 group-hover/card:opacity-100 transition-opacity" />
          {isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle absolute top-2 right-2 z-10 bg-black/40 text-white border-0 min-h-8 min-w-8 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
              aria-label="Media options"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                openMenuRef.current(rect.left, rect.bottom);
              }}
            >
              ⋮
            </button>
          ) : null}
        </div>

        <div className="pt-3 px-0.5 space-y-1.5">
          <h3 className="text-lg lg:text-xl font-semibold leading-snug line-clamp-2 text-base-content/95">
            {title}
          </h3>
          {metaParts.length > 0 ? (
            <p className="text-sm text-base-content/55">{metaParts.join(" · ")}</p>
          ) : null}
          {categoryLabel ? (
            <p className="text-sm text-base-content/45 truncate">{categoryLabel}</p>
          ) : null}
          {isAdmin ? (
            <p className="text-xs text-base-content/40 tabular-nums">{sizeLabel}</p>
          ) : null}
        </div>
      </Link>
      {isAdmin ? (
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadPoster(file);
          }}
        />
      ) : null}
    </ContextMenu>
  );
}
