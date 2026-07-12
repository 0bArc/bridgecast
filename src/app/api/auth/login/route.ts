import { NextResponse } from "next/server";
import { resolveLogin, setSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  const role = resolveLogin(password);
  if (!role) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  await setSession(role);
  return NextResponse.json({ ok: true, role });
}
