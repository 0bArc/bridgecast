import { redirect } from "next/navigation";
import { Suspense } from "react";
import LoginForm from "./login-form";
import { isSetupComplete } from "@/lib/config";

export default function LoginPage() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }

  return (
    <Suspense
      fallback={
        <main className="min-h-dvh flex items-center justify-center">
          <span className="loading loading-spinner loading-lg" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
