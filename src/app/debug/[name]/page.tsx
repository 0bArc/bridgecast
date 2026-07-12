import { notFound } from "next/navigation";
import { DebugWatchContent } from "@/app/debug/debug-content";

type Props = {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ cat?: string }>;
};

export default async function DebugWatchPage({ params, searchParams }: Props) {
  const { name: encoded } = await params;
  const { cat } = await searchParams;
  if (!cat) notFound();

  const name = decodeURIComponent(encoded);
  return <DebugWatchContent cat={cat} name={name} />;
}
