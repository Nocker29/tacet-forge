// The agent tool computes the optimizer screen's arguments from stored data
// (src/agent/optimizerInputs.ts). This renders the real v3 screen with the
// same data, presses Run, and checks both agree, so a change to the screen's
// buff handling fails here instead of making the agent drift.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import OptimizerWorkspaceSetup from "../../src/components/optimizerWorkspace/OptimizerWorkspaceSetup.vue";
import { useCharacterStore } from "../../src/stores/character";
import {
  computeEchoSetPassiveBuffs,
  computeMainEchoStats,
  readOptimizerSettings,
} from "../../src/agent/optimizerInputs";

type Plain = Record<string, any>;

const cases: Array<{ name: string; character: string; record: Plain }> = [
  {
    name: "set passives from the optimizer, always-on main echo saved by the calculator",
    character: "Hiyuki",
    record: {
      mainEcho: {
        echo: "ReminiscenceThrenodianVoidborneConstruct",
        rank: 5,
        buffs: { ReminiscenceThrenodianVoidborneConstruct: { isEnabled: true } },
      },
      optimizer: {
        echoSets: ["WishesofQuietSnowfall"],
        mainEchoes: ["ReminiscenceThrenodianVoidborneConstruct"],
        minStats: [{ id: "m1", stat: "energyRegen", minValue: "120" }],
        optimizationTarget: "Attack:liberationAttacks|ForeclaimingBladeLiberationBaseDMG",
        damageType: "Average",
        loadoutFormat: "Any",
        echoSetPassives: {
          WishesofQuietSnowfall2Set: { isEnabled: true },
          WishesofQuietSnowfall5SetGlacio: { isEnabled: true },
          WishesofQuietSnowfall5SetCritRate: { isEnabled: true },
        },
      },
    },
  },
  {
    name: "stacked passive from the calculator, one overridden, a stacking main echo, two sets",
    character: "Carlotta",
    record: {
      mainEcho: { echo: "LampylumenMyriad", rank: 5, buffs: { LampylumenMyriad: { isEnabled: true, stacks: 2 } } },
      echoSetPassives: {
        FrostyResolve5Set5SetSkillDMGBonus: { isEnabled: true, stacks: 2 },
        FrostyResolve5Set5SetGlacioDMGBonus: { isEnabled: true },
      },
      optimizer: {
        echoSets: ["FrostyResolve", "WishesofQuietSnowfall"],
        mainEchoes: ["LampylumenMyriad", "ReminiscenceThrenodianVoidborneConstruct"],
        minStats: [],
        optimizationTarget: "Stat:totalAtk",
        damageType: "Crit",
        loadoutFormat: "Any",
        echoSetPassives: { FrostyResolve5Set5SetSkillDMGBonus: { isEnabled: true, stacks: 1 } },
        mainEchoBuffs: { ReminiscenceThrenodianVoidborneConstruct: { buffs: { ReminiscenceThrenodianVoidborneConstruct: { isEnabled: true } } } },
      },
    },
  },
  {
    name: "nothing enabled anywhere",
    character: "Jinhsi",
    record: {
      optimizer: {
        echoSets: ["CelestialLight"],
        mainEchoes: ["Jué"],
        optimizationTarget: "Stat:totalAtk",
      },
    },
  },
];

async function runScreen(character: string) {
  const { emitted, unmount } = render(OptimizerWorkspaceSetup, { props: { character } });
  const run = await screen.findByRole("button", { name: /Run Optimizer/i });
  // The target picker loads the character's kit with a dynamic import on
  // mount; on a cold run that import outlived the test and failed after
  // teardown (unhandled rejection). Wait for it, and for the buff rows.
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fireEvent.click(run);
  const events = emitted()["optimizer:optimize"] as unknown[][];
  expect(events?.length).toBeGreaterThan(0);
  unmount();
  return events[events.length - 1];
}

describe("agent optimizer inputs match the optimizer screen", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const store = useCharacterStore();
      store.setCharacterData(testCase.character, structuredClone(testCase.record));
      const stored = JSON.parse(JSON.stringify(store.characters[testCase.character])) as Plain;

      const [setFilters, mainEchoes, minStats, echoSetDataByLabel, mainEchoStats, target, damageType, , loadoutFormat] =
        await runScreen(testCase.character);

      const settings = readOptimizerSettings(stored);
      expect(settings.setFilters).toEqual(setFilters);
      expect(settings.mainEchoes).toEqual(mainEchoes);
      expect(settings.minStats).toEqual(minStats);
      expect(settings.target).toEqual(target);
      expect(settings.damageType).toEqual(damageType);
      expect(settings.loadoutFormat).toEqual(loadoutFormat);
      expect(computeEchoSetPassiveBuffs(stored, settings.setFilters)).toEqual(echoSetDataByLabel);
      expect(computeMainEchoStats(stored, testCase.character, settings.mainEchoes)).toEqual(mainEchoStats);
      if (testCase.character === "Hiyuki") {
        // Guard against a vacuous pass (both sides empty).
        expect(mainEchoStats).toEqual({ ReminiscenceThrenodianVoidborneConstruct: { Glacio: 12, ResonanceLiberationDMGBonus: 12 } });
        expect(echoSetDataByLabel).toEqual({
          "Wishes of Quiet Snowfall 2 Set": { Glacio: 10 },
          "Wishes of Quiet Snowfall 5 Set": { Glacio: 10, CritRate: 25 },
        });
      }
    });
  }
});
