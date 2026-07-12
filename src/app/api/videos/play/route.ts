import { NextRequest } from "next/server";
import { handleVideoRequest } from "@/serve/video-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  const name = request.nextUrl.searchParams.get("name") || "";
  if (!name) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }
  return handleVideoRequest(request, decodeURIComponent(name), cat);
}
