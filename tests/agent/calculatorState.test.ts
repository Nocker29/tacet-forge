import { describe, it, expect } from "vitest";
import { withCalculatorState } from "../../src/agent/calculatorState";

const inventory = [
  { echoId: "a", echo: "ReminiscenceThrenodianVoidborneConstruct", echoSet: "WishesofQuietSnowfall" },
  { echoId: "b", echo: "Glommoth", echoSet: "WishesofQuietSnowfall" },
  { echoId: "c", echo: "IceglintDancer", echoSet: "HeartofSwornVigil" },
  { echoId: "d", echo: "ShadowStepper", echoSet: "HeartofSwornVigil" },
];
const slots = (...ids: string[]) => Object.fromEntries(ids.map((echoId, index) => [String(index), { echoId }]));

describe("withCalculatorState", () => {
  it("fills set bonuses, the slot-1 main echo and its always-on buff, without touching the input", () => {
    const record = { echoes: slots("a", "b", "c", "d"), mainEcho: { rank: 5 } };
    const before = JSON.stringify(record);
    const next = withCalculatorState(record, inventory);
    expect(JSON.stringify(record)).toBe(before);
    expect(next.echoSetBonus).toMatchObject({
      setBonusOne: "Heart of Sworn Vigil 2 Set",
      setBonusTwo: "Wishes of Quiet Snowfall 2 Set",
    });
    expect(next.mainEcho).toEqual({
      rank: 5,
      echo: "ReminiscenceThrenodianVoidborneConstruct",
      buffs: { ReminiscenceThrenodianVoidborneConstruct: { isEnabled: true } },
    });
  });

  it("keeps a manual set override and other saved buff settings", () => {
    const record = {
      setOverride: true,
      echoSetBonus: { setBonusOne: "Custom" },
      echoes: slots("b"),
      mainEcho: { echo: "Glommoth", buffs: { Other: { isEnabled: false } } },
    };
    const next = withCalculatorState(record, inventory);
    expect(next.echoSetBonus).toEqual({ setBonusOne: "Custom" });
    expect(next.mainEcho.echo).toBe("Glommoth");
    expect(next.mainEcho.buffs.Other).toEqual({ isEnabled: false });
  });
});
