import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { clearAllEchoes } from "../../src/utils/settingsBackup";
import { useCharacterStore } from "../../src/stores/character";
import { useInventoryStore } from "../../src/stores/inventory";
import { useTeamRotationsStore } from "../../src/stores/teamRotations";

const ECHO_IDS = ["e1", "e2", "e3"];
const slot = (echoId: string) => ({ echoId, echo: "Jue", echoSet: "CelestialLight", type: 4, stat: "CritRate" });

describe("clearAllEchoes (Danger Zone → Delete all echoes)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const characters = useCharacterStore();
    characters.hardSetState({
      characters: {
        Jinhsi: {
          characterLevel: "90",
          talents: { basic: 10 },
          weapon: "AgesOfHarvest",
          buffs: { SomeBuff: { isEnabled: true } },
          rotations: [{ id: "r1" }],
          echoes: { 0: slot("e1"), 1: slot("e2") },
          echoPresetId: "p1",
          builds: [
            { id: "b1", name: "Main", weapon: "AgesOfHarvest", echoes: { 0: slot("e1") }, echoPresetId: "p1" },
            { id: "b2", name: "Alt", weapon: "Lumingloss", echoes: { 0: slot("e3") } },
          ],
          activeBuildId: "b1",
        },
        Changli: { weapon: "BlazingBrilliance" },
      },
      activeCharacter: "Jinhsi",
      favoriteCharacters: ["Jinhsi"],
    });
    const inventory = useInventoryStore();
    inventory.hardSetState({
      echoes: ECHO_IDS.map(slot),
      equipped: { e1: { Jinhsi: 0 }, e2: { Jinhsi: 1 } },
      echoPresets: [{ presetId: "p1", echo1Id: "e3" }],
      equippedPresets: { Jinhsi: "p1" },
      optimizerProtection: { donors: ["Changli"] },
    });
    useTeamRotationsStore().$patch({ teams: [{ id: "t1", name: "Team" }] } as never);
  });

  it("leaves no echo id or preset reference anywhere", () => {
    clearAllEchoes();
    const everything = JSON.stringify([useCharacterStore().$state, useInventoryStore().$state]);
    for (const id of [...ECHO_IDS, "p1"]) expect(everything).not.toContain(`"${id}"`);
    const inventory = useInventoryStore();
    expect(inventory.echoes).toEqual([]);
    expect(inventory.equipped).toEqual({});
    expect(inventory.echoPresets).toEqual([]);
    expect(inventory.equippedPresets).toEqual({});
  });

  it("keeps characters, builds, weapons, buffs, rotations, teams and protection", () => {
    clearAllEchoes();
    const { characters, activeCharacter, favoriteCharacters } = useCharacterStore();
    expect(Object.keys(characters)).toEqual(["Jinhsi", "Changli"]);
    expect(characters.Jinhsi).toMatchObject({
      characterLevel: "90",
      talents: { basic: 10 },
      weapon: "AgesOfHarvest",
      buffs: { SomeBuff: { isEnabled: true } },
      rotations: [{ id: "r1" }],
      activeBuildId: "b1",
      echoPresetId: null,
    });
    expect(characters.Jinhsi.builds.map((build: { name: string; weapon: string }) => [build.name, build.weapon])).toEqual([
      ["Main", "AgesOfHarvest"],
      ["Alt", "Lumingloss"],
    ]);
    expect(Object.values(characters.Jinhsi.echoes).every((s: any) => s.echoId === null && s.echo === null)).toBe(true);
    expect(characters.Changli).toEqual({ weapon: "BlazingBrilliance" });
    expect([activeCharacter, favoriteCharacters]).toEqual(["Jinhsi", ["Jinhsi"]]);
    expect(useInventoryStore().optimizerProtection).toEqual({ donors: ["Changli"] });
    expect(useTeamRotationsStore().teams).toEqual([{ id: "t1", name: "Team" }]);
  });
});
