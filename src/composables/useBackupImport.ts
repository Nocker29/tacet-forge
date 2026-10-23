/**
 * Tacet Forge: the import actions shared by Backup & Restore and the classic
 * Settings import tab — user-facing messages around the checked imports in
 * src/utils/settingsBackup.ts.
 */
import { useInventoryStore } from "../stores/inventory";
import { BackupImportError, applyImportedDatabase, importEchoesFromRaw } from "../utils/settingsBackup";
import { useDuplicateImportPrompt } from "./useDuplicateImportPrompt";
import { useToast } from "./useToast";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function useBackupImport() {
  const { showToast } = useToast();
  const { askAboutDuplicates } = useDuplicateImportPrompt();
  const inventoryStore = useInventoryStore();

  /** Replaces all data with a backup; reloads on success. Returns whether it was applied. */
  function importBackupText(text: string | null | undefined): boolean {
    try {
      const { undoSaved } = applyImportedDatabase(text ?? "");
      showToast(
        undoSaved
          ? "Your data has been overwritten! You can undo this in Settings → Backup & Restore."
          : "Your data has been overwritten! (No undo copy was kept: browser storage is full.)",
        "success",
      );
      window.setTimeout(() => location.reload(), 1500);
      return true;
    } catch (error) {
      showToast(error instanceof BackupImportError ? error.message : `Import failed: ${String(error)}`, "error");
      return false;
    }
  }

  /** Adds a list of echoes, asking about duplicates. Returns whether anything was imported. */
  async function importEchoesText(text: string): Promise<boolean> {
    try {
      const result = await importEchoesFromRaw(
        text,
        inventoryStore,
        (duplicateCount, totalCount) => askAboutDuplicates(duplicateCount, totalCount) as Promise<"skip" | "import" | null>,
      );
      if (!result) return false;
      const notes = [
        result.skipped ? ` Skipped ${plural(result.skipped, "duplicate", "duplicates")}.` : "",
        result.invalid ? ` Left out ${plural(result.invalid, "entry that isn't an echo", "entries that aren't echoes")}.` : "",
      ].join("");
      showToast(`Imported ${plural(result.imported, "echo", "echoes")}.${notes}`, "success");
      return result.imported > 0;
    } catch (error) {
      const message = error instanceof BackupImportError ? error.message : String(error);
      showToast(`Failed to import echoes: ${message}`, "error");
      return false;
    }
  }

  return { importBackupText, importEchoesText };
}
