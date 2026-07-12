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
    <main className="min-h-dvh flex items-center justify-center p-4 safe-x safe-top safe-bottom">
      <div className="card card-border bg-base-200 w-full max-w-sm sm:max-w-md shadow-xl">
        <div className="card-body">
          <h1 className="card-title text-2xl">{SITE_NAME}</h1>
          <p className="text-sm opacity-70">{SITE_TAGLINE}</p>
          <p className="text-sm opacity-60">
            Guest password for viewers, or admin password from your{" "}
            <code className="text-xs">.env</code>.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4 mt-2">
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text">Password</span>
              </div>
              <input
                type="password"
                className="input input-bordered w-full"
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
              className={`btn btn-primary w-full ${loading ? "btn-disabled" : ""}`}
            >
              {loading ? <span className="loading loading-spinner" /> : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
