import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/config";
import SetupForm from "./setup-form";

export default function SetupPage() {
  if (isSetupComplete()) {
    redirect("/login");
  }
  return <SetupForm />;
}
