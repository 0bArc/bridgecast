import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isAdmin } from "@/lib/auth";
import {
  removeFolderLock,
  removeFolderMask,
  setFolderLock,
  setFolderMask,
  updateViewerPassword,
  updateLibraryRoot,
} from "@/lib/config";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "changePassword") {
    const current =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const next = typeof body.newPassword === "string" ? body.newPassword : "";
    if (next.length < 4) {
      return NextResponse.json(
        { error: "New password must be at least 4 characters" },
        { status: 400 }
      );
    }
    const ok = updateViewerPassword(current, next);
    if (!ok) {
      return NextResponse.json(
        { error: "Current password is wrong" },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "changeLibraryRoot") {
    const libraryRoot =
      typeof body.libraryRoot === "string" ? body.libraryRoot.trim() : "";
    if (!libraryRoot) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }
    const resolved = path.resolve(libraryRoot);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
    updateLibraryRoot(resolved);
    return NextResponse.json({ ok: true });
  }

  if (action === "addFolderLock") {
    const folderId =
      typeof body.folderId === "string" ? body.folderId.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";
    if (!folderId || password.length < 4) {
      return NextResponse.json({ error: "Invalid folder or password" }, {
        status: 400,
      });
    }
    setFolderLock(folderId, password);
    return NextResponse.json({ ok: true });
  }

  if (action === "removeFolderLock") {
    const folderId =
      typeof body.folderId === "string" ? body.folderId.trim() : "";
    if (!folderId) {
      return NextResponse.json({ error: "Folder required" }, { status: 400 });
    }
    removeFolderLock(folderId);
    return NextResponse.json({ ok: true });
  }

  if (action === "setFolderMask") {
    const folderId =
      typeof body.folderId === "string" ? body.folderId.trim() : "";
    const displayName =
      typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!folderId || !displayName) {
      return NextResponse.json({ error: "Folder path and display name required" }, {
        status: 400,
      });
    }
    setFolderMask(folderId, displayName);
    return NextResponse.json({ ok: true });
  }

  if (action === "removeFolderMask") {
    const folderId =
      typeof body.folderId === "string" ? body.folderId.trim() : "";
    if (!folderId) {
      return NextResponse.json({ error: "Folder required" }, { status: 400 });
    }
    removeFolderMask(folderId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
