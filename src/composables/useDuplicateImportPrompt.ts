/**
 * Tacet Forge: the question every echo import asks when some incoming echoes
 * already exist in the inventory (or repeat within the import).
 */
import { useConfirm } from "./useConfirm";

export type DuplicateImportChoice = "skip" | "import" | "review";

export function useDuplicateImportPrompt() {
  const { choose } = useConfirm();

  /**
   * Resolves "skip", "import", "review" (only when `canReview`) or null when
   * the dialog is cancelled.
   */
  function askAboutDuplicates(
    duplicateCount: number,
    totalCount: number,
    { canReview = false } = {},
  ): Promise<DuplicateImportChoice | null> {
    const what =
      duplicateCount === 1
        ? "is an exact copy of an echo you already have"
        : "are exact copies of echoes you already have";
    return choose<DuplicateImportChoice>(
      `${duplicateCount} of ${totalCount} imported echoes ${what} (same echo, set, main stat and substats). Skip ${duplicateCount === 1 ? "it" : "them"}?`,
      {
        title: `${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} found`,
        choices: [
          ...(canReview ? [{ value: "review" as const, label: "Review…" }] : []),
          { value: "import", label: "Import anyway", variant: "warning" },
          { value: "skip", label: "Skip duplicates", variant: "primary" },
        ],
      },
    );
  }

  return { askAboutDuplicates };
}
