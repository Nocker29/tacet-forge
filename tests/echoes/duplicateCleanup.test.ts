import { describe, it, expect } from "vitest";
import { findIncomingDuplicates, planDuplicateRemoval } from "../../src/echoes/duplicateCleanup";

const key = (echo: { echo?: string | null; stat?: string }) => `${echo.echo}|${echo.stat}`;
const echo = (echoId: string, extra: Record<string, unknown> = {}) => ({ echoId, echo: "Jue", stat: "CritRate", ...extra });

describe("planDuplicateRemoval", () => {
  it("keeps the oldest copy when none is held, locked or favorite", () => {
    const plan = planDuplicateRemoval([echo("a"), echo("b"), echo("c")], key, () => false);
    expect(plan).toEqual({ removeIds: ["b", "c"], groupCount: 1 });
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
    expect(plan).toEqual({ removeIds: ["b"], groupCount: 1 });
  });
});

describe("findIncomingDuplicates", () => {
  it("flags copies of inventory echoes and repeats within the import, not the first new one", () => {
    const incoming = [echo("1"), echo("2", { stat: "ATK" }), echo("3", { stat: "ATK" }), { echoId: "4", echo: null }];
    const duplicates = findIncomingDuplicates(incoming, new Set(["Jue|CritRate"]), (e) => (e.echo ? key(e) : null));
    expect([...duplicates]).toEqual([0, 2]);
  });
});
