import { describe, it, expect } from "vitest";
import { echoLevel, findLowLevelEchoes, isBelowMaxLevel } from "../../src/echoes/echoLevel";

// Scanner exports: level-25 echoes with 4 substats and no level field.
const fourSubstats = {
  echo: "Hyvatia",
  echoSubStatsType1: "DEF_FLAT",
  echoSubStatsValue1: 60,
  echoSubStatsType2: "CritDMG",
  echoSubStatsValue2: 15,
  echoSubStatsType3: "HP_FLAT",
  echoSubStatsValue3: 390,
  echoSubStatsType4: "BasicAttackDMGBonus",
  echoSubStatsValue4: 9.4,
  echoSubStatsType5: null,
  echoSubStatsValue5: null,
};

describe("echo level", () => {
  it("only an explicit level counts, never the substat count", () => {
    expect(isBelowMaxLevel(fourSubstats)).toBe(false);
    expect(isBelowMaxLevel({})).toBe(false);
    expect(isBelowMaxLevel({ ...fourSubstats, level: 20 })).toBe(true);
    expect(isBelowMaxLevel({ ...fourSubstats, level: 25 })).toBe(false);
    expect(isBelowMaxLevel({ lvl: "15" })).toBe(true);
    expect(isBelowMaxLevel({ echoLevel: 24 })).toBe(true);
    expect(echoLevel({ level: "" })).toBeNull();
    expect(echoLevel({ level: "abc" })).toBeNull();
  });

  it("groups the low ones by level for the dialog", () => {
    const result = findLowLevelEchoes(
      [fourSubstats, { level: 20 }, { level: 20 }, { level: 0 }, { level: 25 }, { empty: true, level: 5 }],
      (echo) => !("empty" in echo),
    );
    expect(result.indexes).toEqual(new Set([1, 2, 3]));
    expect(result.breakdown).toEqual(["2 at level 20", "1 at level 0"]);
  });
});
