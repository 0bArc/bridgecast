import { NextRequest } from "next/server";
import { handleVideoRequest } from "@/serve/video-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type Props = {
  params: Promise<{ name: string }>;
};

export async function GET(request: NextRequest, { params }: Props) {
  const { name: encoded } = await params;
  const name = decodeURIComponent(encoded);
  const cat = request.nextUrl.searchParams.get("cat") || "";
  return handleVideoRequest(request, name, cat);
}
