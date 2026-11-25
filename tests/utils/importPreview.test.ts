import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { describeImportSummary, summarizeImport } from "../../src/utils/importPreview";
import { useBackupImport } from "../../src/composables/useBackupImport";
import { useConfirm } from "../../src/composables/useConfirm";
import { useCharacterStore } from "../../src/stores/character";

const build = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, ...extra });

const current = {
  character: {
    characters: {
      Hiyuki: { weapon: "Frostburn", builds: [build("b1", "Default build"), build("b2", "Old")] },
      Lucilla: { weapon: "X" },
      Jinhsi: { weapon: "Y" },
    },
  },
  inventory: { echoes: [{ echoId: "e1", rank: 5 }, { echoId: "e2", rank: 5 }, { echoId: "e3", rank: 5 }] },
  teamRotations: { teams: [] },
};

const incoming = {
  character: {
    characters: {
      Hiyuki: {
        weapon: "Frostburn",
        builds: [build("b1", "Default build", { weapon: "Other" }), build("b3", "Agent build 2026-11-25")],
      },
      Lucilla: { weapon: "X" },
      Lily: { weapon: "Lullaby" },
    },
  },
  inventory: { echoes: [{ echoId: "e1", rank: 5 }, { echoId: "e2", rank: 4 }, { echoId: "e9", rank: 5 }] },
  teamRotations: { teams: [{ id: "t" }] },
};

describe("summarizeImport", () => {
  it("lists new, removed and changed characters, builds and echoes", () => {
    const summary = summarizeImport(current, incoming);
    expect(summary.characters).toEqual({ added: ["Lily"], removed: ["Jinhsi"], changed: ["Hiyuki"], total: 3 });
    expect(summary.builds).toEqual({
      added: [{ character: "Hiyuki", name: "Agent build 2026-11-25" }],
      changed: [{ character: "Hiyuki", name: "Default build" }],
      removed: [{ character: "Hiyuki", name: "Old" }],
    });
    expect(summary.echoes).toEqual({ before: 3, after: 3, added: 1, removed: 1, changed: 1 });
    expect(describeImportSummary(summary)).toEqual([
      "New characters: Lily",
      "Characters removed: Jinhsi",
      "Characters changed: Hiyuki",
      "New builds: Hiyuki: Agent build 2026-11-25",
      "Builds changed: Hiyuki: Default build",
      "Builds removed: Hiyuki: Old",
      "Echoes: 1 new, 1 removed, 1 changed (3 → 3)",
      "Teams: 0 → 1",
    ]);
  });

  it("matches the same build saved under another id by name", () => {
    const a = { character: { characters: { H: { builds: [build("x1", "Default build", { createdAt: 1, weapon: "W" })] } } } };
    const b = { character: { characters: { H: { builds: [build("y9", "Default build", { createdAt: 2, weapon: "W" }), build("y2", "New")] } } } };
    expect(summarizeImport(a, b).builds).toEqual({ added: [{ character: "H", name: "New" }], changed: [], removed: [] });
  });

  it("says when nothing changes, and shortens long lists", () => {
    expect(describeImportSummary(summarizeImport(current, current))).toEqual([
      "Characters and builds: no changes (3 characters)",
      "Echoes: no changes (3 echoes)",
    ]);
    const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`C${i}`, {}]));
    const lines = describeImportSummary(summarizeImport({}, { character: { characters: many } }));
    expect(lines[0]).toBe("New characters: C0, C1, C2, C3, C4, C5 and 3 more");
  });
});

describe("importBackupText preview", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const backup = JSON.stringify({
    meta: { version: "9", source: "WutheringTools" },
    data: {
      character: JSON.stringify({ characters: { Lily: { characterLevel: "90" } }, activeCharacter: "Lily", favoriteCharacters: [] }),
      inventory: JSON.stringify({ echoes: [], equipped: {}, echoPresets: [], equippedPresets: {} }),
      teamRotations: JSON.stringify({ teams: [] }),
    },
  });

  it("cancelling the preview changes nothing", async () => {
    useCharacterStore().setCharacterData("Hiyuki", { characterLevel: "80" });
    const pending = useBackupImport().importBackupText(backup);
    const { confirmRequest, settle } = useConfirm();
    expect(confirmRequest.value?.items).toContain("New characters: Lily");
    expect(confirmRequest.value?.items).toContain("Characters removed: Hiyuki");
    settle(false);
    expect(await pending).toBe(false);
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Hiyuki"]);
  });

  it("an invalid backup is reported without a preview", async () => {
    expect(await useBackupImport().importBackupText("{ nope")).toBe(false);
    expect(useConfirm().confirmRequest.value).toBeNull();
  });
});
