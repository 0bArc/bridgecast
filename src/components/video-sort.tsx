"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { VideoSort } from "@/serve/video";

const OPTIONS: { value: VideoSort; label: string }[] = [
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "size-asc", label: "Size ↑" },
  { value: "size-desc", label: "Size ↓" },
];

type Props = {
  cat: string;
  sort: VideoSort;
  query?: string;
};

export function VideoSort({ cat, sort, query }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-2 shrink-0">
      <span className="text-xs opacity-60 hidden sm:inline">Sort</span>
      <select
        className="select select-bordered select-sm min-h-9"
        value={sort}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (cat) params.set("cat", cat);
          else params.delete("cat");
          if (query) params.set("q", query);
          else params.delete("q");
          params.set("sort", e.target.value);
          router.push(`/library?${params.toString()}`);
        }}
        aria-label="Sort videos"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
