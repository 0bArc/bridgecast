import {
  DEBUG_DEFAULT_CAT,
  DEBUG_DEFAULT_NAME,
  DebugWatchContent,
} from "@/app/debug/debug-content";

type Props = {
  searchParams: Promise<{ cat?: string; name?: string }>;
};

export default async function DebugIndexPage({ searchParams }: Props) {
  const params = await searchParams;
  const cat = params.cat || DEBUG_DEFAULT_CAT;
  const name = params.name ? decodeURIComponent(params.name) : DEBUG_DEFAULT_NAME;

  return <DebugWatchContent cat={cat} name={name} />;
}
