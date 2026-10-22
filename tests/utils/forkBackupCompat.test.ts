// Tacet Forge: a backup exported from upstream wutheringtools.com (data version 9,
// before protected characters) must still import and migrate cleanly.
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { applyImportedDatabase } from "../../src/utils/settingsBackup";
import { CURRENT_DATA_VERSION, DATA_VERSION_KEY, runMigrations } from "../../src/migrations";
import { seedOptimizerProtection } from "../../src/migrations/fork/001_addOptimizerProtection";
import {
  FORK_DATA_VERSION_KEY,
  normalizeForkDataVersion,
  runForkMigrations,
} from "../../src/migrations/fork";
import { getExportData } from "../../src/utils/settingsBackup";
import { useCharacterStore } from "../../src/stores/character";
import { useInventoryStore } from "../../src/stores/inventory";

function upstreamBackup(ignoreToggle: boolean | undefined) {
  const character = {
    characters: {
      Jinhsi: {
        characterLevel: "90",
        weapon: "AgesOfHarvest",
        echoes: { 0: { echoId: "e1" } },
        optimizer: ignoreToggle === undefined ? {} : { ignoreOtherResonantorEchoes: ignoreToggle },
      },
      Changli: { characterLevel: "80", echoes: { 0: { echoId: "e2" } } },
    },
    activeCharacter: "Jinhsi",
    favoriteCharacters: ["Jinhsi"],
  };
  const inventory = {
    echoes: [
      { echoId: "e1", echo: "Jue", echoSet: "CelestialLight", type: 4 },
      { echoId: "e2", echo: "Hecate", echoSet: "MoltenRift", type: 4 },
      { echoId: "e3", echo: "Dreamless", echoSet: "MoltenRift", type: 4 },
    ],
    equipped: { e1: { Jinhsi: 0 }, e2: { Changli: 0 } },
    echoPresets: [{ presetId: "p1", echo1Id: "e3" }],
    equippedPresets: { Verina: "p1" },
  };
  return {
    character,
    inventory,
    raw: JSON.stringify({
      meta: { version: "9", source: "WutheringTools" },
      data: {
        character: JSON.stringify(character),
        inventory: JSON.stringify(inventory),
        teamRotations: JSON.stringify({ teams: [] }),
      },
    }),
  };
}

describe("importing an upstream (v9) backup", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("keeps characters, echoes and preset assignments", () => {
    applyImportedDatabase(upstreamBackup(undefined).raw);
    const characters = useCharacterStore();
    const inventory = useInventoryStore();
    expect(Object.keys(characters.characters).sort()).toEqual(["Changli", "Jinhsi"]);
    expect(characters.activeCharacter).toBe("Jinhsi");
    expect(inventory.echoes).toHaveLength(3);
    expect(inventory.equippedPresets).toEqual({ Verina: "p1" });
  });

  it.each([
    [true, []],
    [false, ["Changli", "Jinhsi", "Verina"]],
    [undefined, []],
  ])("seeds protection from the old toggle (%s → donors %j)", (toggle, donors) => {
    applyImportedDatabase(upstreamBackup(toggle).raw);
    expect(useInventoryStore().optimizerProtection).toEqual({ donors });
  });

  it("keeps an imported fork backup's own protection list", () => {
    const { character, inventory } = upstreamBackup(true);
    applyImportedDatabase(
      JSON.stringify({
        meta: { version: String(CURRENT_DATA_VERSION), source: "WutheringTools" },
        data: {
          character: JSON.stringify(character),
          inventory: JSON.stringify({ ...inventory, optimizerProtection: { donors: ["Changli"] } }),
        },
      }),
    );
    expect(useInventoryStore().optimizerDonors).toEqual(["Changli"]);
  });
});

describe("fork migration 1 on stored v9 data", () => {
  beforeEach(() => localStorage.clear());

  it("seeds inventory.optimizerProtection from localStorage without touching upstream's version", () => {
    const { character, inventory } = upstreamBackup(false);
    localStorage.setItem(DATA_VERSION_KEY, "9");
    localStorage.setItem("character", JSON.stringify(character));
    localStorage.setItem("inventory", JSON.stringify(inventory));
    normalizeForkDataVersion();
    runMigrations();
    runForkMigrations();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(CURRENT_DATA_VERSION));
    expect(localStorage.getItem(FORK_DATA_VERSION_KEY)).toBe("1");
    const stored = JSON.parse(localStorage.getItem("inventory")!);
    expect(stored.optimizerProtection).toEqual({ donors: ["Changli", "Jinhsi", "Verina"] });
    expect(stored.echoes).toHaveLength(3);
  });

  it("is idempotent and leaves bad JSON alone", () => {
    const seeded = seedOptimizerProtection(null, JSON.stringify({ echoes: [], optimizerProtection: { donors: ["A"] } }));
    expect(JSON.parse(seeded).optimizerProtection).toEqual({ donors: ["A"] });
    expect(seedOptimizerProtection(null, "not json")).toBe("not json");
    expect(seedOptimizerProtection("not json", "{}")).toBe(JSON.stringify({ optimizerProtection: { donors: [] } }));
  });

  it("leaves an empty profile untouched", () => {
    normalizeForkDataVersion();
    runMigrations();
    runForkMigrations();
    expect(localStorage.length).toBe(0);
  });
});

describe("profiles and backups from the fork's first release (stamped data version 10)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("puts a stored version 10 back to 9 once, so upstream's own 10 will still run", () => {
    const { character, inventory } = upstreamBackup(false);
    localStorage.setItem(DATA_VERSION_KEY, "10");
    localStorage.setItem("character", JSON.stringify(character));
    localStorage.setItem("inventory", JSON.stringify({ ...inventory, optimizerProtection: { donors: ["Changli"] } }));
    normalizeForkDataVersion();
    runMigrations();
    runForkMigrations();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe("9");
    expect(localStorage.getItem(FORK_DATA_VERSION_KEY)).toBe("1");
    expect(JSON.parse(localStorage.getItem("inventory")!).optimizerProtection).toEqual({ donors: ["Changli"] });

    // A later upstream v10 stamp is left alone once the fork track has run.
    localStorage.setItem(DATA_VERSION_KEY, "10");
    normalizeForkDataVersion();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe("10");
  });

  it("imports an unmarked v10 fork backup as v9 and keeps its protection list", () => {
    const { character, inventory } = upstreamBackup(true);
    applyImportedDatabase(
      JSON.stringify({
        meta: { version: "10", source: "WutheringTools" },
        data: {
          character: JSON.stringify(character),
          inventory: JSON.stringify({ ...inventory, optimizerProtection: { donors: ["Changli"] } }),
        },
      }),
    );
    expect(useInventoryStore().optimizerDonors).toEqual(["Changli"]);
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(CURRENT_DATA_VERSION));
    expect(localStorage.getItem(FORK_DATA_VERSION_KEY)).toBe("1");
  });

  it("marks new exports with the fork's data version", () => {
    localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
    expect(getExportData().meta).toMatchObject({
      version: String(CURRENT_DATA_VERSION),
      source: "WutheringTools",
      forkDataVersion: "1",
    });
  });
});
