import { requireAdmin } from "@/lib/guards";
import { getFolderLocks, getFolderMasks, getLibraryRoot } from "@/lib/config";
import SettingsForm from "./settings-form";

export default async function SettingsPage() {
  await requireAdmin();
  const locks = Object.keys(getFolderLocks());

  return (
    <SettingsForm
      libraryRoot={getLibraryRoot()}
      folderLocks={locks}
      folderMasks={getFolderMasks()}
    />
  );
}
