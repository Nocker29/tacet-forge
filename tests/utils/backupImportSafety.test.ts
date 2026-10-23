// Tacet Forge: a broken or crafted backup must never change existing data.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  BackupImportError,
  UNDO_IMPORT_KEY,
  applyImportedDatabase,
  getUndoImportBackupText,
  getUndoImportInfo,
  importEchoesFromRaw,
  undoLastImport,
} from "../../src/utils/settingsBackup";
import { useCharacterStore } from "../../src/stores/character";
import { useInventoryStore } from "../../src/stores/inventory";
import { useTeamRotationsStore } from "../../src/stores/teamRotations";

const echo = (echoId: string, extra: Record<string, unknown> = {}) => ({
  echoId,
  echo: "Jue",
  echoSet: "CelestialLight",
  type: 4,
  rank: 5,
  stat: "CritRate",
  echoSubStatsType1: "CritDMG",
  echoSubStatsValue1: 21,
  ...extra,
});

function backup(character: unknown, inventory: unknown, teamRotations: unknown = { teams: [] }) {
  return JSON.stringify({
    meta: { version: "9", source: "WutheringTools" },
    data: {
      character: JSON.stringify(character),
      inventory: JSON.stringify(inventory),
      teamRotations: JSON.stringify(teamRotations),
    },
  });
}

const goodBackup = () =>
  backup(
    {
      characters: { Hiyuki: { weapon: "Frostburn", echoes: { 0: { echoId: "n1" } } } },
      activeCharacter: "Hiyuki",
      favoriteCharacters: [],
    },
    { echoes: [echo("n1")], equipped: { n1: { Hiyuki: 0 } }, echoPresets: [], equippedPresets: {} },
  );

function seedExisting() {
  useCharacterStore().hardSetState({
    characters: { Jinhsi: { weapon: "AgesOfHarvest" } },
    activeCharacter: "Jinhsi",
    favoriteCharacters: ["Jinhsi"],
  });
  useInventoryStore().hardSetState({ echoes: [echo("old")], equipped: {}, echoPresets: [], equippedPresets: {} });
  useTeamRotationsStore().hardSetState({ teams: [{ id: "t1" }] });
}

const currentData = () =>
  JSON.stringify([useCharacterStore().$state, useInventoryStore().$state, useTeamRotationsStore().$state]);

const protoBackup = JSON.stringify({
  meta: { version: "9" },
  data: { character: '{"__proto__":{"polluted":true},"characters":{}}' },
});

describe("backup import safety", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    seedExisting();
  });

  const bad: Array<[string, string]> = [
    ["empty", ""],
    ["not JSON", "{oops"],
    ["a JSON list", "[1,2,3]"],
    ["prototype keys", protoBackup],
    ["unreadable store part", JSON.stringify({ meta: { version: "9" }, data: { character: "{not json", inventory: "{}" } })],
    ["characters as a list", backup({ characters: [1, 2] }, { echoes: [] })],
    ["echoes not a list", backup({ characters: {} }, { echoes: "lots" })],
    ["echo without id", backup({ characters: {} }, { echoes: [{ echo: "Jue" }] })],
    [
      "markup in a numeric echo field",
      backup({ characters: {} }, { echoes: [echo("x", { echoSubStatsValue1: '7<img src=x onerror="alert(1)">' })] }),
    ],
    [
      "markup in a character's echo slot",
      backup({ characters: { A: { echoes: { 0: { echoSubStatsValue2: "<script>" } } } } }, { echoes: [] }),
    ],
    ["duplicate echo ids", backup({ characters: {} }, { echoes: [echo("d"), echo("d")] })],
    ["bad equipped map", backup({ characters: {} }, { echoes: [], equipped: { a: { Jinhsi: "<b>" } } })],
    ["bad presets", backup({ characters: {} }, { echoes: [], echoPresets: [{ echo1Id: 5 }] })],
    ["bad teams", backup({ characters: {} }, { echoes: [] }, { teams: "x" })],
  ];

  it.each(bad)("rejects %s and changes nothing", (_, raw) => {
    const before = currentData();
    expect(() => applyImportedDatabase(raw)).toThrow(BackupImportError);
    expect(currentData()).toBe(before);
    expect(localStorage.getItem(UNDO_IMPORT_KEY)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("imports a valid backup and keeps the previous data for undo", () => {
    const before = currentData();
    expect(applyImportedDatabase(goodBackup())).toEqual({ undoSaved: true });
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Hiyuki"]);
    expect(getUndoImportInfo()).not.toBeNull();
    expect(JSON.parse(getUndoImportBackupText()!).data.character).toContain("Jinhsi");

    expect(undoLastImport()).toBe(true);
    expect(currentData()).toBe(before);
    expect(getUndoImportInfo()).toBeNull();
  });

  it("puts everything back when applying fails halfway", () => {
    const before = currentData();
    vi.spyOn(useInventoryStore(), "ensureOptimizerProtection").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => applyImportedDatabase(goodBackup())).toThrow(/nothing was changed/);
    expect(currentData()).toBe(before);
    vi.restoreAllMocks();
  });

  it("still imports when there's no room for the undo copy", () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === UNDO_IMPORT_KEY) throw new DOMException("full", "QuotaExceededError");
      return setItem.call(this, key, value);
    });
    expect(applyImportedDatabase(goodBackup())).toEqual({ undoSaved: false });
    expect(Object.keys(useCharacterStore().characters)).toEqual(["Hiyuki"]);
    vi.restoreAllMocks();
  });
});

describe("Import echoes safety", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useInventoryStore().hardSetState({ echoes: [echo("old")] });
  });

  it("leaves out entries that aren't echoes and never reuses incoming ids", async () => {
    const raw = JSON.stringify([
      { ...echo("old"), stat: "ATK" }, // valid, but must not overwrite echo "old"
      { echo: "Jue", echoSubStatsValue1: "<img onerror=x>" },
      "text",
      42,
      { noEcho: true },
    ]);
    const result = await importEchoesFromRaw(raw, useInventoryStore());
    expect(result).toEqual({ imported: 1, skipped: 0, invalid: 4 });
    const echoes = useInventoryStore().echoes as Array<{ echoId: string; stat: string }>;
    expect(echoes).toHaveLength(2);
    expect(echoes.find((e) => e.echoId === "old")?.stat).toBe("CritRate");
  });

  it.each([
    ["not JSON", "{"],
    ["not a list", '{"echo":"Jue"}'],
    ["nothing valid", '[1,"x"]'],
  ])("rejects %s", async (_, raw) => {
    await expect(importEchoesFromRaw(raw, useInventoryStore())).rejects.toThrow(BackupImportError);
    expect(useInventoryStore().echoes).toHaveLength(1);
  });
});
