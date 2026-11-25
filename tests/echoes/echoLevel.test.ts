import { describe, it, expect } from "vitest";
import { filledSubstatCount, findLowLevelEchoes, isBelowMaxLevel } from "../../src/echoes/echoLevel";

const subs = (count: number) =>
  Object.fromEntries(
    Array.from({ length: 5 }, (_, i) => [
      [`echoSubStatsType${i + 1}`, i < count ? "ATK" : "none"],
      [`echoSubStatsValue${i + 1}`, i < count ? 10 : 0],
    ]).flat(),
  );

describe("echo level", () => {
  it("infers it from the substats unless the data has a level", () => {
    expect(filledSubstatCount(subs(4))).toBe(4);
    expect(isBelowMaxLevel(subs(5))).toBe(false);
    expect(isBelowMaxLevel(subs(4))).toBe(true);
    expect(isBelowMaxLevel({})).toBe(true);
    expect(isBelowMaxLevel({ ...subs(5), level: 20 })).toBe(true);
    expect(isBelowMaxLevel({ ...subs(3), level: "25" })).toBe(false);
  });

  it("groups the low ones for the dialog", () => {
    const result = findLowLevelEchoes(
      [subs(5), subs(4), subs(4), subs(0), { ...subs(5), level: 15 }, { empty: true }],
      (echo) => !("empty" in echo),
    );
    expect(result.indexes).toEqual(new Set([1, 2, 3, 4]));
    expect(result.inferred).toBe(true);
    expect(result.breakdown).toEqual([
      "1 at level 15",
      "2 with 4 substats (level 20–24)",
      "1 with 0 substats (level 0–4)",
    ]);
    expect(findLowLevelEchoes([{ ...subs(5), level: 10 }]).inferred).toBe(false);
  });
});
