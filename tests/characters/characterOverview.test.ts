import { describe, it, expect } from "vitest";
import {
  countEquippedEchoes,
  filterAndSortCharacters,
  getCharacterLevel,
  getSequenceLevel,
  listSavedCharacters,
  summarizeActiveEchoSets,
  type ListedCharacter,
} from "../../src/characters/characterOverview";
import { resolveInitialCalculatorScreen } from "../../src/utils/calculatorScreen";

const roster: ListedCharacter[] = [
  { key: "Jinhsi", name: "Jinhsi", element: "Spectro", rarity: 5, weapon: "Broadblade" },
  { key: "Aalto", name: "Aalto", element: "Aero", rarity: 4, weapon: "Pistol" },
  { key: "Carlotta", name: "Carlotta", element: "Glacio", rarity: 5, weapon: "Pistol" },
  { key: "Danjin", name: "Danjin", element: "Havoc", rarity: 4, weapon: "Sword" },
];

describe("listSavedCharacters", () => {
  it("lists roster characters that have a store record, in roster order", () => {
    const characters = { Danjin: {}, Jinhsi: { characterLevel: "80" } };
    expect(listSavedCharacters(characters, roster).map((c) => c.key)).toEqual(["Jinhsi", "Danjin"]);
  });

  it("skips records for characters not in the roster and non-object records", () => {
    const characters = { Unreleased: {}, Aalto: null, Carlotta: "x" } as any;
    expect(listSavedCharacters(characters, roster)).toEqual([]);
  });

  it("handles a missing store", () => {
    expect(listSavedCharacters(undefined, roster)).toEqual([]);
  });
});

describe("getSequenceLevel", () => {
  it("is the highest enabled sequence node", () => {
    expect(
      getSequenceLevel({
        SequenceNode1Foo: { isEnabled: true },
        SequenceNode2Bar: { isEnabled: true },
        SequenceNode2BarVariant: { isEnabled: false },
        SequenceNode4Baz: { isEnabled: false },
      }),
    ).toBe(2);
  });

  it("counts a node when any of its variants is on", () => {
    expect(getSequenceLevel({ SequenceNode6AFusionBurst: { isEnabled: true } })).toBe(6);
  });

  it("is S0 with nothing enabled, unknown keys or no data", () => {
    expect(getSequenceLevel({ SomethingElse: { isEnabled: true } })).toBe(0);
    expect(getSequenceLevel(undefined)).toBe(0);
    expect(getSequenceLevel({ SequenceNode3X: undefined })).toBe(0);
  });
});

describe("getCharacterLevel", () => {
  it("parses the stored string level and defaults to 90", () => {
    expect(getCharacterLevel({ characterLevel: "70" })).toBe(70);
    expect(getCharacterLevel({ characterLevel: "80+" })).toBe(80);
    expect(getCharacterLevel({})).toBe(90);
    expect(getCharacterLevel(null)).toBe(90);
    expect(getCharacterLevel({ characterLevel: "abc" })).toBe(90);
  });
});

describe("summarizeActiveEchoSets", () => {
  it("keeps sets that reach their bonus threshold, most pieces first", () => {
    const echoes = [
      { echoSet: "MoltenRift" },
      { echoSet: "MoltenRift" },
      { echoSet: "MoltenRift" },
      { echoSet: "VoidThunder" },
      { echoSet: "VoidThunder" },
    ];
    expect(summarizeActiveEchoSets(echoes)).toEqual([
      { key: "MoltenRift", count: 3 },
      { key: "VoidThunder", count: 2 },
    ]);
  });

  it("drops single pieces of 2pc sets, empty slots and 'none'", () => {
    expect(
      summarizeActiveEchoSets([{ echoSet: "MoltenRift" }, {}, null, { echoSet: "none" }, undefined]),
    ).toEqual([]);
  });
});

describe("countEquippedEchoes", () => {
  it("counts inventory-linked and inline echoes", () => {
    expect(
      countEquippedEchoes({ echoes: { 0: { echoId: "a" }, 1: { echo: "Hecate" }, 2: { echoId: null } } }),
    ).toBe(2);
    expect(countEquippedEchoes(undefined)).toBe(0);
  });
});

describe("filterAndSortCharacters", () => {
  const characters = {
    Jinhsi: { characterLevel: "90", resonanceChains: { SequenceNode2X: { isEnabled: true } } },
    Aalto: { characterLevel: "80", buildStatus: "wont-build" },
    Carlotta: { characterLevel: "90", resonanceChains: { SequenceNode6X: { isEnabled: true } } },
    Danjin: { characterLevel: "70" },
  };

  const keys = (filters = {}) => filterAndSortCharacters(roster, characters, filters).map((c) => c.key);

  it("sorts by name by default", () => {
    expect(keys()).toEqual(["Aalto", "Carlotta", "Danjin", "Jinhsi"]);
  });

  it("filters by search (case-insensitive), element and weapon", () => {
    expect(keys({ search: "  CAR " })).toEqual(["Carlotta"]);
    expect(keys({ element: "Spectro" })).toEqual(["Jinhsi"]);
    expect(keys({ weapon: "Pistol" })).toEqual(["Aalto", "Carlotta"]);
  });

  it("hides Won't build characters when asked", () => {
    expect(keys({ hideWontBuild: true })).toEqual(["Carlotta", "Danjin", "Jinhsi"]);
  });

  it("sorts by level, sequence, rarity, element and weapon with name as tiebreak", () => {
    expect(keys({ sort: "level" })).toEqual(["Carlotta", "Jinhsi", "Aalto", "Danjin"]);
    expect(keys({ sort: "sequence" })).toEqual(["Carlotta", "Jinhsi", "Aalto", "Danjin"]);
    expect(keys({ sort: "rarity" })).toEqual(["Carlotta", "Jinhsi", "Aalto", "Danjin"]);
    expect(keys({ sort: "element" })).toEqual(["Aalto", "Carlotta", "Danjin", "Jinhsi"]);
    expect(keys({ sort: "weapon" })).toEqual(["Jinhsi", "Aalto", "Carlotta", "Danjin"]);
  });

  it("doesn't mutate the input list", () => {
    const copy = [...roster];
    filterAndSortCharacters(roster, characters, { sort: "level" });
    expect(roster).toEqual(copy);
  });
});

describe("resolveInitialCalculatorScreen", () => {
  it("accepts known screens and falls back to character", () => {
    expect(resolveInitialCalculatorScreen("optimizer")).toBe("optimizer");
    expect(resolveInitialCalculatorScreen(["echoes"])).toBe("echoes");
    expect(resolveInitialCalculatorScreen("nope")).toBe("character");
    expect(resolveInitialCalculatorScreen(undefined)).toBe("character");
  });
});
