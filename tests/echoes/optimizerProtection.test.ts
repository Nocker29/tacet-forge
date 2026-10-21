import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  countHeldEchoes,
  deriveLegacyDonors,
  filterEchoesBySets,
  getEchoHolders,
  getLoadoutDonors,
  getProtectedEchoIds,
  invertCandidates,
  listProtectionCandidates,
  protectCandidates,
  readProtectionState,
  summarizeProtection,
  toggleDonor,
  unlockCandidates,
} from "../../src/echoes/optimizerProtection";
import { useInventoryStore } from "../../src/stores/inventory";
import { useCharacterStore } from "../../src/stores/character";

// e1: Jinhsi; e2: Jinhsi + Changli (shared); e3: Changli; e4: in Verina's preset; e5: free;
// e6: on the optimized character (Carlotta) and also on Changli.
const equipped = {
  e1: { Jinhsi: 0 },
  e2: { Jinhsi: 1, Changli: 0 },
  e3: { Changli: 1 },
  e6: { Carlotta: 0, Changli: 2 },
  empty: {},
};
const equippedPresets = { Verina: "p1", Ghost: "missing" };
const echoPresets = [{ presetId: "p1", echo1Id: "e4", echo2Id: null }];
const holders = getEchoHolders(equipped, equippedPresets, echoPresets);

describe("getEchoHolders", () => {
  it("joins the equipped map with assigned presets", () => {
    expect([...holders.keys()].sort()).toEqual(["e1", "e2", "e3", "e4", "e6"]);
    expect([...holders.get("e2")!].sort()).toEqual(["Changli", "Jinhsi"]);
    expect([...holders.get("e4")!]).toEqual(["Verina"]);
  });

  it("tolerates missing data", () => {
    expect(getEchoHolders(undefined, null, undefined).size).toBe(0);
  });
});

describe("listProtectionCandidates", () => {
  it("lists every holder except the optimized character, sorted", () => {
    expect(listProtectionCandidates(holders, "Carlotta")).toEqual(["Changli", "Jinhsi", "Verina"]);
  });
});

describe("getProtectedEchoIds", () => {
  it("excludes everything other characters hold when nobody is a donor", () => {
    const excluded = getProtectedEchoIds(holders, [], "Carlotta");
    expect([...excluded.keys()].sort()).toEqual(["e1", "e2", "e3", "e4"]);
    // The optimized character's own echo stays usable even if a protected character shares it.
    expect(excluded.has("e6")).toBe(false);
  });

  it("excludes a shared echo when ANY holder is protected", () => {
    const excluded = getProtectedEchoIds(holders, ["Changli"], "Carlotta");
    expect(excluded.get("e2")).toEqual(["Jinhsi"]);
    expect(excluded.has("e3")).toBe(false);
  });

  it("frees everything when all holders are donors", () => {
    expect(getProtectedEchoIds(holders, ["Changli", "Jinhsi", "Verina"], "Carlotta").size).toBe(0);
  });
});

describe("summarizeProtection", () => {
  it("counts excluded echoes once, attributing them to each protected holder", () => {
    const excluded = getProtectedEchoIds(holders, [], "Carlotta");
    const summary = summarizeProtection(["e1", "e2", "e3", "e5", "e6"], excluded);
    expect(summary.total).toBe(5);
    expect(summary.excludedCount).toBe(3);
    expect(summary.byCharacter).toEqual([
      { character: "Changli", count: 2 },
      { character: "Jinhsi", count: 2 },
    ]);
  });
});

describe("getLoadoutDonors", () => {
  it("names the other characters a loadout takes echoes from", () => {
    expect(getLoadoutDonors(["e2", "e3", "e5", "e6", null], holders, "Carlotta")).toEqual([
      { character: "Changli", count: 2 },
      { character: "Jinhsi", count: 1 },
    ]);
  });
});

describe("bulk actions", () => {
  const candidates = ["Changli", "Jinhsi", "Verina"];
  it("toggles one character", () => {
    expect(toggleDonor([], "Jinhsi")).toEqual(["Jinhsi"]);
    expect(toggleDonor(["Jinhsi"], "Jinhsi")).toEqual([]);
  });
  it("protect all / unlock all / invert act on the listed candidates only", () => {
    expect(protectCandidates(["Jinhsi", "Other"], candidates)).toEqual(["Other"]);
    expect(unlockCandidates(["Other"], candidates)).toEqual(["Changli", "Jinhsi", "Other", "Verina"]);
    expect(invertCandidates(["Jinhsi", "Other"], candidates)).toEqual(["Changli", "Other", "Verina"]);
  });
});

describe("deriveLegacyDonors (old ignore-equipped toggle)", () => {
  it("protects everyone when any character had the toggle on", () => {
    const characters = {
      A: { optimizer: { ignoreOtherResonantorEchoes: false } },
      B: { optimizer: { ignoreOtherResonantorEchoes: true } },
    };
    expect(deriveLegacyDonors(characters, holders)).toEqual([]);
  });
  it("makes every current holder a donor when it was explicitly off", () => {
    const characters = { A: { optimizer: { ignoreOtherResonantorEchoes: false } }, B: {} };
    expect(deriveLegacyDonors(characters, holders)).toEqual(["Carlotta", "Changli", "Jinhsi", "Verina"]);
  });
  it("reads string values the old settings prop accepted", () => {
    const characters = {
      A: { optimizer: { ignoreOtherResonantorEchoes: "true" } },
      B: { optimizer: { ignoreOtherResonantorEchoes: false } },
    };
    expect(deriveLegacyDonors(characters, holders)).toEqual([]);
    expect(deriveLegacyDonors({ A: { optimizer: { ignoreOtherResonantorEchoes: "false" } } }, holders)).toHaveLength(4);
  });

  it("uses the new default (all protected) when it was never set", () => {
    expect(deriveLegacyDonors({ A: {}, B: { optimizer: {} } }, holders)).toEqual([]);
    expect(deriveLegacyDonors(undefined, holders)).toEqual([]);
  });
});

describe("filterEchoesBySets", () => {
  it("keeps every echo for an empty filter and only chosen sets otherwise", () => {
    const echoes = [{ echoSet: "A" }, { echoSet: "B" }, {}];
    expect(filterEchoesBySets(echoes, [])).toEqual(echoes);
    expect(filterEchoesBySets(echoes, ["B"])).toEqual([{ echoSet: "B" }]);
  });
});

describe("readProtectionState", () => {
  it("accepts only a donors array of strings", () => {
    expect(readProtectionState({ donors: ["A", 3, "B"] })).toEqual({ donors: ["A", "B"] });
    expect(readProtectionState({ donors: "A" })).toBeNull();
    expect(readProtectionState(null)).toBeNull();
  });
});

describe("inventory store integration", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("defaults to everyone protected and newly equipped characters start protected", () => {
    const inventory = useInventoryStore();
    inventory.hardSetState({ echoes: [], equipped: { e1: { Jinhsi: 0 } } });
    expect(inventory.optimizerDonors).toEqual([]);
    inventory.setOptimizerDonors(["Jinhsi"]);
    inventory.setEquippedData("e9", { Changli: 0 });
    expect([...inventory.protectedEchoIds("Carlotta").keys()]).toEqual(["e9"]);
  });

  it("never derives donors from the legacy toggle at runtime, only when seeding", () => {
    useCharacterStore().hardSetState({
      characters: { Carlotta: { optimizer: { ignoreOtherResonantorEchoes: false } } },
    } as never);
    const inventory = useInventoryStore();
    inventory.hardSetState({ echoes: [], equipped: { e1: { Jinhsi: 0 } } });
    // The optimizer UIs still write `false` on every save; that must not unlock anyone.
    expect(inventory.optimizerDonors).toEqual([]);
    inventory.ensureOptimizerProtection();
    expect(inventory.optimizerProtection).toEqual({ donors: ["Jinhsi"] });
    // Once stored, a later holder is protected rather than derived as a donor.
    inventory.setEquippedData("e2", { Changli: 0 });
    expect(inventory.optimizerDonors).toEqual(["Jinhsi"]);
  });

  it("round-trips protection and preset assignments through hardSetState", () => {
    const inventory = useInventoryStore();
    inventory.hardSetState({
      echoes: [],
      equipped: {},
      echoPresets: [],
      equippedPresets: { Verina: "p1" },
      optimizerProtection: { donors: ["Verina"] },
    });
    expect(inventory.equippedPresets).toEqual({ Verina: "p1" });
    expect(inventory.optimizerDonors).toEqual(["Verina"]);
  });
});

describe("countHeldEchoes", () => {
  it("counts each holder of the given echoes, skipping echoes not in the list", () => {
    const holders = new Map([
      ["e1", new Set(["Jinhsi"])],
      ["e2", new Set(["Jinhsi", "Changli"])],
      ["e3", new Set(["Verina"])],
    ]);
    expect(Object.fromEntries(countHeldEchoes(["e1", "e2", "e9"], holders))).toEqual({
      Jinhsi: 2,
      Changli: 1,
    });
  });
});
