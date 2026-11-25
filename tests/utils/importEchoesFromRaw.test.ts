import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { importEchoesFromRaw } from "../../src/utils/settingsBackup";
import { useInventoryStore } from "../../src/stores/inventory";

const full = Object.fromEntries(
  ["ATK", "HP", "DEF", "ATK_FLAT", "EnergyRegen"].flatMap((type, i) => [
    [`echoSubStatsType${i + 1}`, type],
    [`echoSubStatsValue${i + 1}`, 10],
  ]),
);
const base = { echo: "Jue", echoSet: "CelestialLight", type: 4, rank: 5, stat: "CritRate", ...full };
const fourSubstats = { echoSubStatsType5: "none", echoSubStatsValue5: 0 };

describe("importEchoesFromRaw duplicate handling", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useInventoryStore().echoes = [{ echoId: "have", ...base }] as never;
  });

  const raw = JSON.stringify([base, { ...base, stat: "CritDMG" }, { ...base, stat: "CritDMG" }]);

  it("asks once and skips copies of inventory echoes and repeats", async () => {
    const decide = vi.fn().mockResolvedValue("skip");
    const result = await importEchoesFromRaw(raw, useInventoryStore(), decide);
    expect(decide).toHaveBeenCalledWith(2, 3);
    expect(result).toEqual({ imported: 1, skipped: 2, lowLevelSkipped: 0, invalid: 0 });
    expect(useInventoryStore().echoes).toHaveLength(2);
  });

  it("imports everything when told to", async () => {
    const result = await importEchoesFromRaw(raw, useInventoryStore(), async () => "import");
    expect(result).toEqual({ imported: 3, skipped: 0, lowLevelSkipped: 0, invalid: 0 });
    expect(useInventoryStore().echoes).toHaveLength(4);
  });

  it("imports nothing when cancelled", async () => {
    expect(await importEchoesFromRaw(raw, useInventoryStore(), async () => null)).toBeNull();
    expect(useInventoryStore().echoes).toHaveLength(1);
  });

  it("doesn't ask without duplicates", async () => {
    const decide = vi.fn();
    const result = await importEchoesFromRaw(JSON.stringify([{ ...base, stat: "ATK" }]), useInventoryStore(), decide);
    expect(decide).not.toHaveBeenCalled();
    expect(result).toEqual({ imported: 1, skipped: 0, lowLevelSkipped: 0, invalid: 0 });
  });
});

describe("importEchoesFromRaw below-level-25 echoes", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useInventoryStore().echoes = [{ echoId: "have", ...base }] as never;
  });

  // A full copy of "have", a 4-substat copy of "have", and a new full echo.
  const raw = JSON.stringify([base, { ...base, ...fourSubstats }, { ...base, stat: "ATK" }]);

  it("asks about level first, then about duplicates among what is left", async () => {
    const order: string[] = [];
    const decideLevel = vi.fn(async () => (order.push("level"), "skip" as const));
    const decideDuplicates = vi.fn(async () => (order.push("duplicates"), "skip" as const));
    const result = await importEchoesFromRaw(raw, useInventoryStore(), decideDuplicates, decideLevel);
    expect(order).toEqual(["level", "duplicates"]);
    expect(decideLevel.mock.calls[0][0]).toMatchObject({ indexes: new Set([1]), inferred: true });
    expect(decideLevel.mock.calls[0][1]).toBe(3);
    expect(decideDuplicates).toHaveBeenCalledWith(1, 2);
    expect(result).toEqual({ imported: 1, skipped: 1, lowLevelSkipped: 1, invalid: 0 });
  });

  it("imports them when told to (they can still be duplicates)", async () => {
    const decideDuplicates = vi.fn(async () => "import" as const);
    const result = await importEchoesFromRaw(raw, useInventoryStore(), decideDuplicates, async () => "import");
    expect(decideDuplicates).toHaveBeenCalledWith(1, 3);
    expect(result).toEqual({ imported: 3, skipped: 0, lowLevelSkipped: 0, invalid: 0 });
  });

  it("cancelling the level question imports nothing and skips the duplicates question", async () => {
    const decideDuplicates = vi.fn();
    expect(await importEchoesFromRaw(raw, useInventoryStore(), decideDuplicates, async () => null)).toBeNull();
    expect(decideDuplicates).not.toHaveBeenCalled();
    expect(useInventoryStore().echoes).toHaveLength(1);
  });

  it("skipping when every echo is below 25 imports nothing", async () => {
    const result = await importEchoesFromRaw(JSON.stringify([{ ...base, ...fourSubstats }]), useInventoryStore(), vi.fn(), async () => "skip");
    expect(result).toEqual({ imported: 0, skipped: 0, lowLevelSkipped: 1, invalid: 0 });
  });

  it("doesn't ask when every echo is level 25", async () => {
    const decideLevel = vi.fn();
    await importEchoesFromRaw(JSON.stringify([{ ...base, stat: "ATK" }]), useInventoryStore(), vi.fn(), decideLevel);
    expect(decideLevel).not.toHaveBeenCalled();
  });
});
