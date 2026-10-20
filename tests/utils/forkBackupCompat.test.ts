// Tacet Forge: a backup exported from upstream wutheringtools.com (data version 9,
// before protected characters) must still import and migrate cleanly.
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { applyImportedDatabase } from "../../src/utils/settingsBackup";
import { CURRENT_DATA_VERSION, DATA_VERSION_KEY, runMigrations } from "../../src/migrations";
import { seedOptimizerProtection } from "../../src/migrations/versions/010_addOptimizerProtection";
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

describe("migration 010 on stored v9 data", () => {
  beforeEach(() => localStorage.clear());

  it("seeds inventory.optimizerProtection from localStorage and bumps the version", () => {
    const { character, inventory } = upstreamBackup(false);
    localStorage.setItem(DATA_VERSION_KEY, "9");
    localStorage.setItem("character", JSON.stringify(character));
    localStorage.setItem("inventory", JSON.stringify(inventory));
    runMigrations();
    expect(localStorage.getItem(DATA_VERSION_KEY)).toBe(String(CURRENT_DATA_VERSION));
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
});
