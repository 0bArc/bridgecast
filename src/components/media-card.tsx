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
      className="relative h-full"
      onReady={(openAt) => {
        openMenuRef.current = openAt;
      }}
    >
      <Link
        href={href}
        prefetch={false}
        className="card card-border bg-base-200 hover:bg-base-300 active:bg-base-300 transition-colors overflow-hidden block touch-manipulation h-full"
      >
        <div className="relative">
          <VideoPreview posterSrc={poster} title={title} eager={eager} />
          {isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle absolute top-2 right-2 z-10 bg-black/50 text-white border-0 min-h-8 min-w-8"
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
        <div className="card-body p-4 gap-1">
          <h3 className="card-title text-base line-clamp-2 leading-snug">
            {title}
          </h3>
          {metaParts.length > 0 ? (
            <p className="text-xs opacity-50">{metaParts.join(" · ")}</p>
          ) : null}
          {categoryLabel ? (
            <p className="text-xs opacity-50 truncate">{categoryLabel}</p>
          ) : null}
          <p className="text-sm opacity-60">{sizeLabel}</p>
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
