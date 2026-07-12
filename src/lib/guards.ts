import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { isSetupComplete } from "@/lib/config";
import { isCategoryAccessible } from "@/lib/folder-lock";

export async function requireSetup(): Promise<void> {
  if (!isSetupComplete()) {
    redirect("/setup");
  }
}

export async function requireAuth(): Promise<void> {
  await requireSetup();
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
}

export async function requireAdmin(): Promise<void> {
  await requireAuth();
  const { isAdmin } = await import("@/lib/auth");
  if (!(await isAdmin())) {
    redirect("/library");
  }
}

export async function requireCategoryAccess(categoryId: string): Promise<void> {
  await requireAuth();
  if (!categoryId) return;
  if (!(await isCategoryAccessible(categoryId))) {
    redirect(
      `/folder-unlock?cat=${encodeURIComponent(categoryId)}`
    );
  }
}
