import { NextResponse } from "next/server";
import {
  createInitialConfig,
  getConfigPath,
  isSetupComplete,
  saveConfig,
} from "@/lib/config";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  if (isSetupComplete()) {
    return NextResponse.json({ error: "Already configured" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const libraryRoot =
    typeof body.libraryRoot === "string" ? body.libraryRoot.trim() : "";

  if (password.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 }
    );
  }

  if (!libraryRoot) {
    return NextResponse.json(
      { error: "Library folder path is required" },
      { status: 400 }
    );
  }

  const resolved = path.resolve(libraryRoot);
  if (!fs.existsSync(resolved)) {
    return NextResponse.json(
      { error: "Folder does not exist on this machine" },
      { status: 400 }
    );
  }

  const config = createInitialConfig(password, resolved);
  saveConfig(config);

  return NextResponse.json({ ok: true, configPath: getConfigPath() });
}
