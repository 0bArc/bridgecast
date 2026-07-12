"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { SITE_NAME } from "@/lib/site";

type Props = {
  displayLabel: string;
};

export default function UnlockForm({ displayLabel }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const cat = params.get("cat") || "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/folder/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cat, password }),
    });
    setLoading(false);

    if (!res.ok) {
      setError("Wrong password");
      return;
    }

    router.push(`/library?cat=${encodeURIComponent(cat)}`);
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 safe-x">
      <div className="card card-border bg-base-200 w-full max-w-sm">
        <div className="card-body gap-4">
          <h1 className="card-title text-xl">Private folder</h1>
          <p className="text-sm opacity-70">
            <span className="font-medium">{displayLabel}</span> is password
            protected.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Folder password</span>
              </div>
              <input
                type="password"
                className="input input-bordered shadow-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            {error ? (
              <div role="alert" className="alert alert-error text-sm py-2">
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className={`btn btn-neutral w-full shadow-none ${loading ? "btn-disabled" : ""}`}
            >
              {loading ? <span className="loading loading-spinner" /> : "Unlock"}
            </button>

            <a href="/library" className="btn btn-ghost btn-sm shadow-none">
              ← Back to {SITE_NAME}
            </a>
          </form>
        </div>
      </div>
    </main>
  );
}
