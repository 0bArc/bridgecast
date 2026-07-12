"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function SetupForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [libraryRoot, setLibraryRoot] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!libraryRoot.trim()) {
      setError("Enter the folder path where your videos live");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, libraryRoot: libraryRoot.trim() }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Setup failed");
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 safe-x safe-top safe-bottom">
      <div className="card card-border bg-base-200 w-full max-w-lg shadow-xl">
        <div className="card-body gap-4">
          <div>
            <h1 className="card-title text-2xl">{SITE_NAME}</h1>
            <p className="text-sm opacity-70 mt-1">{SITE_TAGLINE}</p>
          </div>

          <p className="text-sm">
            Welcome! Point BridgeCast at a folder on this machine. It will
            discover subfolders and videos automatically.
          </p>

          <p className="text-sm opacity-60">
            Set a guest password for family/friends. You sign in with{" "}
            <code className="text-xs">ADMIN_PASSWORD</code> from your{" "}
            <code className="text-xs">.env</code> file.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Guest password</span>
              </div>
              <input
                type="password"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Confirm password</span>
              </div>
              <input
                type="password"
                className="input input-bordered w-full"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Video library folder</span>
              </div>
              <input
                type="text"
                className="input input-bordered w-full font-mono text-sm"
                placeholder="/home/user/Videos or C:\Videos\Movies"
                value={libraryRoot}
                onChange={(e) => setLibraryRoot(e.target.value)}
                required
              />
              <div className="label">
                <span className="label-text-alt opacity-60">
                  Absolute path on this server — e.g. Movies, Action, etc. as
                  subfolders
                </span>
              </div>
            </label>

            {error ? (
              <div role="alert" className="alert alert-error text-sm py-2">
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className={`btn btn-primary w-full ${loading ? "btn-disabled" : ""}`}
            >
              {loading ? (
                <span className="loading loading-spinner" />
              ) : (
                "Complete setup"
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
