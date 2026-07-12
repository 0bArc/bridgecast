"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/library";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Wrong password");
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 safe-x safe-top safe-bottom bg-base-100">
      <div className="glass-card w-full max-w-sm sm:max-w-md">
        <div className="p-6 sm:p-8 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{SITE_NAME}</h1>
          <p className="text-sm text-base-content/55">{SITE_TAGLINE}</p>
          <p className="text-sm text-base-content/45 pb-2">
            Guest password for viewers, or admin password from your{" "}
            <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded">.env</code>.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-2">
            <label className="form-control w-full">
              <div className="label py-1">
                <span className="label-text text-base-content/60">Password</span>
              </div>
              <input
                type="password"
                className="input w-full glass-input border-0 h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              className={`btn w-full bg-white/90 text-black border-0 hover:bg-white ${loading ? "btn-disabled" : ""}`}
            >
              {loading ? <span className="loading loading-spinner" /> : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
