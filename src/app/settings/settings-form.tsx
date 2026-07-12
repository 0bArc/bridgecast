"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

type Props = {
  libraryRoot: string;
  folderLocks: string[];
  folderMasks: Record<string, string>;
};

function Row({
  title,
  subtitle,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-base-300/80">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle ? (
          <p className="text-xs opacity-40 font-mono truncate">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn-outline btn-error btn-xs h-8 min-h-8 px-3 shadow-none shrink-0"
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

export default function SettingsForm({
  libraryRoot,
  folderLocks,
  folderMasks,
}: Props) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoot, setNewRoot] = useState(libraryRoot);
  const [maskFolder, setMaskFolder] = useState("");
  const [maskName, setMaskName] = useState("");
  const [lockFolder, setLockFolder] = useState("");
  const [lockPassword, setLockPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function post(action: string, extra: Record<string, string>) {
    setMessage("");
    setError("");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Request failed");
      return false;
    }
    setMessage("Saved");
    router.refresh();
    return true;
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    const ok = await post("changePassword", {
      currentPassword,
      newPassword,
    });
    if (ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  async function onRoot(e: FormEvent) {
    e.preventDefault();
    await post("changeLibraryRoot", { libraryRoot: newRoot });
  }

  async function onAddMask(e: FormEvent) {
    e.preventDefault();
    const ok = await post("setFolderMask", {
      folderId: maskFolder,
      displayName: maskName,
    });
    if (ok) {
      setMaskFolder("");
      setMaskName("");
    }
  }

  async function onAddLock(e: FormEvent) {
    e.preventDefault();
    const ok = await post("addFolderLock", {
      folderId: lockFolder,
      password: lockPassword,
    });
    if (ok) {
      setLockFolder("");
      setLockPassword("");
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar isAdmin />

      <main className="flex-1 p-4 safe-x max-w-2xl mx-auto w-full pb-12">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {message ? (
          <div role="status" className="alert alert-success mb-4 text-sm py-2">
            <span>{message}</span>
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="alert alert-error mb-4 text-sm py-2">
            <span>{error}</span>
          </div>
        ) : null}

        <section className="card card-border bg-base-200 mb-6">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Guest password</h2>
            <p className="text-sm opacity-60">
              Admin password is set in <code className="text-xs">ADMIN_PASSWORD</code>{" "}
              in your <code className="text-xs">.env</code> file.
            </p>
            <form onSubmit={onPassword} className="flex flex-col gap-3">
              <input
                type="password"
                className="input input-bordered shadow-none"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <input
                type="password"
                className="input input-bordered shadow-none"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-neutral btn-sm w-fit shadow-none"
              >
                Update guest password
              </button>
            </form>
          </div>
        </section>

        <section className="card card-border bg-base-200 mb-6">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Library folder</h2>
            <form onSubmit={onRoot} className="flex flex-col gap-3">
              <input
                type="text"
                className="input input-bordered font-mono text-sm shadow-none"
                value={newRoot}
                onChange={(e) => setNewRoot(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-neutral btn-sm w-fit shadow-none"
              >
                Update path
              </button>
            </form>
          </div>
        </section>

        <section className="card card-border bg-base-200 mb-6">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Display names</h2>
            <p className="text-sm opacity-70">
              Rename folders in the UI only — disk paths stay the same. Use{" "}
              <code className="text-xs">Porn</code> →{" "}
              <code className="text-xs">Personal</code> so guests see the alias.
            </p>

            {Object.keys(folderMasks).length > 0 ? (
              <div className="flex flex-col gap-2">
                {Object.entries(folderMasks).map(([id, label]) => (
                  <Row
                    key={id}
                    title={label}
                    subtitle={id}
                    onRemove={() => void post("removeFolderMask", { folderId: id })}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm opacity-50">No custom names yet.</p>
            )}

            <form onSubmit={onAddMask} className="flex flex-col gap-3">
              <input
                type="text"
                className="input input-bordered font-mono text-sm shadow-none"
                placeholder="Real folder path e.g. Porn"
                value={maskFolder}
                onChange={(e) => setMaskFolder(e.target.value)}
              />
              <input
                type="text"
                className="input input-bordered shadow-none"
                placeholder="Show as e.g. Personal"
                value={maskName}
                onChange={(e) => setMaskName(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-neutral btn-sm w-fit shadow-none"
              >
                Save display name
              </button>
            </form>
          </div>
        </section>

        <section className="card card-border bg-base-200">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Private folders</h2>
            <p className="text-sm opacity-70">
              Password-protect a folder. Path is relative to library root.
            </p>

            {folderLocks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {folderLocks.map((id) => (
                  <Row
                    key={id}
                    title={folderMasks[id] || id}
                    subtitle={folderMasks[id] ? id : undefined}
                    onRemove={() => void post("removeFolderLock", { folderId: id })}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm opacity-50">No locked folders yet.</p>
            )}

            <form onSubmit={onAddLock} className="flex flex-col gap-3">
              <input
                type="text"
                className="input input-bordered font-mono text-sm shadow-none"
                placeholder="Folder path e.g. Personal"
                value={lockFolder}
                onChange={(e) => setLockFolder(e.target.value)}
              />
              <input
                type="password"
                className="input input-bordered shadow-none"
                placeholder="Folder password"
                value={lockPassword}
                onChange={(e) => setLockPassword(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-neutral btn-sm w-fit shadow-none"
              >
                Lock folder
              </button>
            </form>
          </div>
        </section>

        <Link
          href="/library"
          className="btn btn-ghost btn-sm mt-6 shadow-none"
        >
          ← Back to library
        </Link>
      </main>
    </div>
  );
}
