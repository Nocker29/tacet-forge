import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { importEchoesFromRaw } from "../../src/utils/settingsBackup";
import { useInventoryStore } from "../../src/stores/inventory";

const base = { echo: "Jue", echoSet: "CelestialLight", type: 4, rank: 5, stat: "CritRate" };

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
    expect(result).toEqual({ imported: 1, skipped: 2 });
    expect(useInventoryStore().echoes).toHaveLength(2);
  });

  it("imports everything when told to", async () => {
    const result = await importEchoesFromRaw(raw, useInventoryStore(), async () => "import");
    expect(result).toEqual({ imported: 3, skipped: 0 });
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
    expect(result).toEqual({ imported: 1, skipped: 0 });
  });
});
