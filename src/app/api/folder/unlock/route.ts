import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { unlockFolder } from "@/lib/folder-lock";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const cat = typeof body.cat === "string" ? body.cat : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!cat || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const ok = await unlockFolder(cat, password);
  if (!ok) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
