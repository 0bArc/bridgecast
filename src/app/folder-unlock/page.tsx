import { Suspense } from "react";
import { formatCategoryPath } from "@/lib/display";
import UnlockForm from "./unlock-form";

type Props = {
  searchParams: Promise<{ cat?: string }>;
};

export default async function FolderUnlockPage({ searchParams }: Props) {
  const { cat = "" } = await searchParams;
  const displayLabel = formatCategoryPath(cat);

  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center">
          <span className="loading loading-spinner loading-lg" />
        </main>
      }
    >
      <UnlockForm displayLabel={displayLabel} />
    </Suspense>
  );
}
