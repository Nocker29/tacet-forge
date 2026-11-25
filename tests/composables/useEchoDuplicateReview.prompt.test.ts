import { describe, it, expect, beforeEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInventoryStore } from "../../src/stores/inventory";

const ask = vi.hoisted(() => vi.fn());
const askLevel = vi.hoisted(() => vi.fn());
vi.mock("../../src/composables/useLowLevelImportPrompt", () => ({
  useLowLevelImportPrompt: () => ({ askAboutLowLevel: askLevel }),
}));
vi.mock("../../src/composables/useDuplicateImportPrompt", () => ({
  useDuplicateImportPrompt: () => ({ askAboutDuplicates: ask }),
}));
// Feed already-mapped echoes straight through.
vi.mock("../../src/echoes/parsedEchoMapping", () => ({
  mapParsedEchoes: (echoes: unknown[]) => echoes,
}));

import { useEchoDuplicateReview } from "../../src/composables/useEchoDuplicateReview";

const full = Object.fromEntries(
  ["ATK", "HP", "DEF", "ATK_FLAT", "EnergyRegen"].flatMap((type, i) => [
    [`echoSubStatsType${i + 1}`, type],
    [`echoSubStatsValue${i + 1}`, 10],
  ]),
);
const base = { echo: "Jue", echoSet: "CelestialLight", type: 4, rank: 5, stat: "CritRate", ...full };
const incoming = [
  { echoId: "dup", ...base },
  { echoId: "fresh", ...base, stat: "CritDMG" },
];

function setup() {
  const onFinalized = vi.fn();
  const review = useEchoDuplicateReview({ inventoryOnly: () => true, character: () => "Jinhsi", onFinalized });
  return { review, onFinalized };
}

describe("useEchoDuplicateReview duplicate question", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useInventoryStore().echoes = [{ echoId: "have", ...base }] as never;
    ask.mockReset();
    askLevel.mockReset();
  });

  const ids = () => useInventoryStore().echoes.map((echo: { echoId: string }) => echo.echoId);

  it("skips duplicates", async () => {
    ask.mockResolvedValue("skip");
    const { review, onFinalized } = setup();
    await review.handleEchoesParsed(incoming as never, true);
    expect(ask).toHaveBeenCalledWith(1, 2, { canReview: true });
    expect(ids()).toEqual(["have", "fresh"]);
    expect(onFinalized).toHaveBeenCalledWith(1);
  });

  it("imports everything anyway", async () => {
    ask.mockResolvedValue("import");
    const { review } = setup();
    await review.handleEchoesParsed(incoming as never, true);
    expect(ids()).toEqual(["have", "dup", "fresh"]);
  });

  it.each(["review", null])("opens the review list on %s, with duplicates unchecked", async (choice) => {
    ask.mockResolvedValue(choice);
    const { review, onFinalized } = setup();
    await review.handleEchoesParsed(incoming as never, true);
    expect(review.isReviewingDuplicates.value).toBe(true);
    expect(review.duplicateReviewItems.value.map((item) => [item.isDuplicate, item.selected])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(onFinalized).not.toHaveBeenCalled();
  });

  it("doesn't ask when nothing is a duplicate", async () => {
    const { review } = setup();
    await review.handleEchoesParsed([incoming[1]] as never, true);
    expect(ask).not.toHaveBeenCalled();
    expect(ids()).toEqual(["have", "fresh"]);
  });
});

describe("useEchoDuplicateReview below-level-25 question", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useInventoryStore().echoes = [{ echoId: "have", ...base }] as never;
    ask.mockReset();
    askLevel.mockReset();
  });

  const ids = () => useInventoryStore().echoes.map((echo: { echoId: string }) => echo.echoId);
  // "low" copies "have" but has only 4 substats; "dup" is a full copy of "have".
  const lowLevel = { echoId: "low", ...base, echoSubStatsType5: "none", echoSubStatsValue5: 0 };
  const list = [{ echoId: "dup", ...base }, lowLevel, { echoId: "fresh", ...base, stat: "CritDMG" }];

  it("asks about level first, then about duplicates among what is left", async () => {
    const order: string[] = [];
    askLevel.mockImplementation(async () => (order.push("level"), "skip"));
    ask.mockImplementation(async () => (order.push("duplicates"), "skip"));
    const { review, onFinalized } = setup();
    await review.handleEchoesParsed(list as never, true);
    expect(order).toEqual(["level", "duplicates"]);
    expect(askLevel.mock.calls[0][0].indexes).toEqual(new Set([1]));
    expect(askLevel.mock.calls[0][1]).toBe(3);
    expect(ask).toHaveBeenCalledWith(1, 2, { canReview: true });
    expect(ids()).toEqual(["have", "fresh"]);
    expect(onFinalized).toHaveBeenCalledWith(1);
  });

  it("imports low-level echoes when told to", async () => {
    askLevel.mockResolvedValue("import");
    ask.mockResolvedValue("skip");
    const { review } = setup();
    await review.handleEchoesParsed([lowLevel] as never, true);
    expect(ask).not.toHaveBeenCalled();
    expect(ids()).toEqual(["have", "low"]);
  });

  it("cancelling the level question imports nothing", async () => {
    askLevel.mockResolvedValue(null);
    const { review, onFinalized } = setup();
    await review.handleEchoesParsed(list as never, true);
    expect(ask).not.toHaveBeenCalled();
    expect(ids()).toEqual(["have"]);
    expect(onFinalized).not.toHaveBeenCalled();
  });
});
