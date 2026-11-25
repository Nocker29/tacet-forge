/**
 * Tacet Forge: the import actions shared by Backup & Restore and the classic
 * Settings import tab — user-facing messages around the checked imports in
 * src/utils/settingsBackup.ts.
 */
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { useTeamRotationsStore } from "../stores/teamRotations";
import { BackupImportError, applyImportedDatabase, importEchoesFromRaw, prepareImport } from "../utils/settingsBackup";
import { describeImportSummary, summarizeImport } from "../utils/importPreview";
import { useConfirm } from "./useConfirm";
import { useDuplicateImportPrompt } from "./useDuplicateImportPrompt";
import { useToast } from "./useToast";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function useBackupImport() {
  const { showToast } = useToast();
  const { askAboutDuplicates } = useDuplicateImportPrompt();
  const inventoryStore = useInventoryStore();
  const { confirm } = useConfirm();

  /**
   * Replaces all data with a backup after showing what it changes (checked
   * first, nothing touched until confirmed); reloads on success. Returns
   * whether it was applied.
   */
  async function importBackupText(text: string | null | undefined): Promise<boolean> {
    let items: string[];
    try {
      const summary = summarizeImport(
        {
          character: useCharacterStore().$state,
          inventory: inventoryStore.$state,
          teamRotations: useTeamRotationsStore().$state,
        },
        prepareImport(text ?? ""),
      );
      items = describeImportSummary(summary);
    } catch (error) {
      showToast(error instanceof BackupImportError ? error.message : `Import failed: ${String(error)}`, "error");
      return false;
    }
    const confirmed = await confirm(
      "This backup replaces all of your current data. Compared with what you have now:",
      { title: "Import preview", items, confirmLabel: "Overwrite my data", variant: "error" },
    );
    if (!confirmed) return false;
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
