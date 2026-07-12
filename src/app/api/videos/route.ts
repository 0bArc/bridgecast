import { NextRequest, NextResponse } from "next/server";
import { listTopLevel } from "@/serve/library";
import { listVideos } from "@/serve/video";

export async function GET(request: NextRequest) {
  const cat = request.nextUrl.searchParams.get("cat") || "";
  if (cat) {
    return NextResponse.json({ videos: listVideos(cat) });
  }
  return NextResponse.json({ categories: listTopLevel() });
}
