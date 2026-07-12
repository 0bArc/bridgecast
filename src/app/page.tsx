import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { isSetupComplete } from "@/lib/config";

export default async function HomePage() {
  if (!isSetupComplete()) {
    redirect("/setup");
  }
  if (await isAuthenticated()) {
    redirect("/library");
  }
  redirect("/login");
}
