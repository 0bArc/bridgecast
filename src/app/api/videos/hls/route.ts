import { NextRequest } from "next/server";
import { handleHlsRequest } from "@/serve/hls-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const name = request.nextUrl.searchParams.get("name") || "";
  const file = request.nextUrl.searchParams.get("file") || "playlist.m3u8";
  const statusOnly = request.nextUrl.searchParams.get("status") === "1";

  return handleHlsRequest(request, { cat, name, file, statusOnly });
}
