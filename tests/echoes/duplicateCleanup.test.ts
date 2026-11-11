import { describe, it, expect } from "vitest";
import { findIncomingDuplicates, findOlderCopies, getDuplicateKey, planDuplicateRemoval } from "../../src/echoes/duplicateCleanup";

const key = (echo: { echo?: string | null; stat?: string }) => `${echo.echo}|${echo.stat}`;
const echo = (echoId: string, extra: Record<string, unknown> = {}) => ({ echoId, echo: "Jue", stat: "CritRate", ...extra });

describe("planDuplicateRemoval", () => {
  it("keeps the oldest copy when none is held, locked or favorite", () => {
    const plan = planDuplicateRemoval([echo("a"), echo("b"), echo("c")], key, () => false);
    expect(plan).toEqual({ removeIds: ["b", "c"], groupCount: 1, olderIds: [] });
  });

  it("prefers a favorite over the oldest copy", () => {
    expect(planDuplicateRemoval([echo("a"), echo("b", { favorite: true })], key, () => false).removeIds).toEqual(["a"]);
  });

  it("keeps every copy a character holds or that is locked, removing only the free extras", () => {
    const echoes = [echo("a"), echo("b"), echo("c", { locked: true }), echo("d")];
    const held = new Set(["b", "d"]);
    expect(planDuplicateRemoval(echoes, key, (id) => held.has(id)).removeIds).toEqual(["a"]);
  });

  it("counts only groups that lose a copy and ignores empty slots and unique echoes", () => {
    const echoes = [
      echo("a"),
      echo("b"),
      echo("x", { stat: "ATK" }),
      echo("held-1", { stat: "HP" }),
      echo("held-2", { stat: "HP" }),
      { echoId: "empty-1", echo: null },
      { echoId: "empty-2", echo: null },
    ];
    const plan = planDuplicateRemoval(echoes, key, (id) => id.startsWith("held"));
    expect(plan).toEqual({ removeIds: ["b"], groupCount: 1, olderIds: [] });
  });
});

describe("findIncomingDuplicates", () => {
  it("flags copies of inventory echoes and repeats within the import, not the first new one", () => {
    const incoming = [echo("1"), echo("2", { stat: "ATK" }), echo("3", { stat: "ATK" }), { echoId: "4", echo: null }];
    const duplicates = findIncomingDuplicates(incoming, new Set(["Jue|CritRate"]), (e) => (e.echo ? key(e) : null));
    expect([...duplicates]).toEqual([0, 2]);
  });
});

describe("getDuplicateKey", () => {
  const full = {
    echo: "BloomburstPuppet", echoSet: "HeartofSwornVigil", type: 4, rank: 5, stat: "ATK",
    echoSubStatsType1: "CritRate", echoSubStatsValue1: 9.3,
    echoSubStatsType2: "CritDMG", echoSubStatsValue2: 15,
    echoSubStatsType3: "ATK", echoSubStatsValue3: 9.4,
  };

  it("ignores substat order, number formatting and empty vs missing slots", () => {
    const reordered = {
      ...full,
      echoSubStatsType1: "ATK", echoSubStatsValue1: "9.40",
      echoSubStatsType3: "CritRate", echoSubStatsValue3: "9.3",
      echoSubStatsType4: null, echoSubStatsValue4: null,
      echoSubStatsType5: "none", echoSubStatsValue5: 0,
      type: "4", rank: "5",
    };
    expect(getDuplicateKey(reordered)).toBe(getDuplicateKey(full));
  });

  it("still tells different echoes apart", () => {
    expect(getDuplicateKey({ ...full, echoSubStatsValue2: 15.1 })).not.toBe(getDuplicateKey(full));
    expect(getDuplicateKey({ ...full, stat: "HP" })).not.toBe(getDuplicateKey(full));
  });
});

describe("findOlderCopies", () => {
  const base = { echo: "KernelPuppetJoy", echoSet: "HeartofSwornVigil", type: 3, rank: 5, stat: "ATK" };
  const subs = (...pairs: Array<[string, number]>) =>
    Object.fromEntries(pairs.flatMap(([type, value], i) => [[`echoSubStatsType${i + 1}`, type], [`echoSubStatsValue${i + 1}`, value]]));

  it("links copies with a subset of another copy's substats to the most upgraded one", () => {
    const echoes = [
      { echoId: "lv10", ...base, ...subs(["CritRate", 6.3], ["ATK", 40]) },
      { echoId: "lv25", ...base, ...subs(["CritRate", 6.3], ["ATK", 40], ["CritDMG", 12.6], ["HP", 7.9], ["DEF", 50]) },
      { echoId: "lv15", ...base, ...subs(["ATK", 40], ["CritRate", 6.3], ["CritDMG", 12.6]) },
      { echoId: "other", ...base, ...subs(["CritRate", 8.1], ["ATK", 40]) },
      { echoId: "otherMain", ...base, stat: "HP", ...subs(["CritRate", 6.3]) },
    ];
    expect(Object.fromEntries(findOlderCopies(echoes))).toEqual({ lv10: "lv25", lv15: "lv25" });
  });
});

describe("planDuplicateRemoval with older copies", () => {
  const echoes = [
    { echoId: "new", echo: "Jue" },
    { echoId: "oldFree", echo: "Jue" },
    { echoId: "oldWorn", echo: "Jue" },
    { echoId: "oldLocked", echo: "Jue", locked: true },
  ];
  const older = new Map([["oldFree", "new"], ["oldWorn", "new"], ["oldLocked", "new"]]);

  it("offers only free older copies and never equipped or locked ones", () => {
    const plan = planDuplicateRemoval(echoes, (e) => e.echoId, (id) => id === "oldWorn", older);
    expect(plan).toEqual({ removeIds: [], groupCount: 0, olderIds: ["oldFree"] });
  });
});
