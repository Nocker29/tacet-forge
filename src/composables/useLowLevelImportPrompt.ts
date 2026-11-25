/**
 * Tacet Forge: the question every echo import asks first when some incoming
 * echoes are below level 25 (src/echoes/echoLevel.ts). The duplicates
 * question (useDuplicateImportPrompt.ts) comes after, on what is left.
 */
import type { LowLevelEchoes } from "../echoes/echoLevel";
import { useConfirm } from "./useConfirm";

export type LowLevelImportChoice = "skip" | "import";

export function useLowLevelImportPrompt() {
  const { choose } = useConfirm();

  /** Resolves "skip", "import" or null when the dialog is cancelled. */
  function askAboutLowLevel(lowLevel: LowLevelEchoes, totalCount: number): Promise<LowLevelImportChoice | null> {
    const count = lowLevel.indexes.size;
    const one = count === 1;
    return choose<LowLevelImportChoice>(
      `${count} of ${totalCount} imported echoes ${one ? "is" : "are"} below level 25. Import ${one ? "it" : "them"} anyway?`,
      {
        title: `${count} echo${one ? "" : "es"} below level 25`,
        items: lowLevel.breakdown,
        choices: [
          { value: "import", label: "Import anyway", variant: "warning" },
          { value: "skip", label: `Skip ${one ? "it" : "them"}`, variant: "primary" },
        ],
      },
    );
  }

  return { askAboutLowLevel };
}
