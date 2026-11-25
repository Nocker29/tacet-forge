/**
 * Tacet Forge agent tool: the optimizer arguments the v3 optimizer screen
 * (OptimizerWorkspaceSetup.vue) passes to Calculator.vue's handleOptimize,
 * computed from a stored character record instead of mounted components.
 *
 * The two buff computations below mirror CalculatorOptimizerEchoSetPassive.vue
 * and CalculatorOptimizerMainEcho.vue/CalculatorMainEchoBuff.vue (v3, with
 * the calculator fallback on). Pass the record through withCalculatorState
 * (calculatorState.ts) first: the screen's calculator fallback reads what the
 * calculator saved. tests/agent/optimizerInputs.parity.test.ts
 * mounts the real screen and compares, so an upstream change there fails a
 * test instead of silently drifting.
 */
import { resolveOptimizerBuff, getMainEchoBuffEntry, getCalculatorMainEchoBuffEntry } from "../calculator/optimizerBuffStatus";
import { getSetBonusEffectsFromListOfSetKeys, getSetLabelByKey } from "../echoes/sets";
import { getEchoData, mainEchoesData } from "../echoes/index";
import { getMainEchoBuffs, mergeMainEchoBuffStats } from "../echoes/mainEchoBuffs";
import { applyMainEchoBuffEffects } from "../echoes/applyMainEchoBuffEffects";
import { normalizeLoadoutFormat } from "../calculator/optimizer";

type Plain = Record<string, any>;

export interface OptimizerSettings {
  setFilters: string[];
  mainEchoes: string[];
  minStats: Array<{ stat: string; minValue: number | string }>;
  target: string | null;
  damageType: "Normal" | "Average" | "Crit";
  loadoutFormat: string;
}

/** The character's saved optimizer settings (what the optimizer screen loads on mount). */
export function readOptimizerSettings(record: Plain | undefined): OptimizerSettings {
  const optimizer = (record?.optimizer ?? {}) as Plain;
  return {
    setFilters: [...(optimizer.echoSets ?? [])],
    mainEchoes: [...(optimizer.mainEchoes ?? [])],
    minStats: [...(optimizer.minStats ?? [])],
    target: (optimizer.optimizationTarget as string | null | undefined) ?? null,
    damageType: (optimizer.damageType as OptimizerSettings["damageType"]) ?? "Average",
    loadoutFormat: normalizeLoadoutFormat(optimizer.loadoutFormat),
  };
}

function talentModifierValue(modifierItem: Plain, talentRef: unknown): number | undefined {
  const map = modifierItem.modifierValue as Record<string, number> | undefined;
  if (!map) return undefined;
  return map[String(talentRef ?? "10")];
}

/** Mirrors CalculatorOptimizerEchoSetPassive.vue's `buffStats` (calculator fallback on). */
function setPassiveStats(record: Plain, passive: Plain): Record<string, unknown> {
  const talentData = (record.talents ?? {}) as Plain;
  const resolved = resolveOptimizerBuff({
    optimizerEntry: record.optimizer?.echoSetPassives?.[passive.key],
    calculatorEntry: record.echoSetPassives?.[passive.key],
    hasStacks: Boolean(passive.hasStacks),
    alwaysEnabled: Boolean(passive.alwaysEnabled),
    calculatorFallback: true,
  });
  const data: Record<string, any> = {};
  if (!resolved.isEnabled) return data;
  const modifiers = (passive.modifiers ?? []) as Plain[];
  if (!passive.hasStacks) {
    modifiers.forEach((modifierItem) => {
      if (modifierItem?.modifySpecificTalents) {
        if (!data.modifySpecificTalents) data.modifySpecificTalents = [];
        modifierItem.modifierValueCalculated = Number(modifierItem.modifierValue);
        data.modifySpecificTalents.push(modifierItem);
      } else if (modifierItem.modifier === "Talent") {
        const talentVal = talentModifierValue(modifierItem, talentData?.[modifierItem.modifierValueTalentRef ?? ""] ?? "10");
        if (modifierItem.modifierTalentKey != null && talentVal != null) data[modifierItem.modifierTalentKey] = talentVal;
      } else if (modifierItem.modifier === "EnableAttack") {
        data[modifierItem.modifier] = modifierItem.modifierValue;
      } else if (modifierItem.modifier === "talentModifierMultiply") {
        if (!data.talentModifierMultiply) data.talentModifierMultiply = [];
        data.talentModifierMultiply.push(modifierItem);
      } else if (modifierItem.modifier) {
        data[modifierItem.modifier] = modifierItem.modifierValue;
      }
    });
    return data;
  }
  const stacks = resolved.stacks;
  if (stacks === 0) return data;
  modifiers.forEach((modifierItem) => {
    if (modifierItem?.modifySpecificTalents) {
      if (!data.modifySpecificTalents) data.modifySpecificTalents = [];
      modifierItem.modifierValueCalculated = Number(modifierItem.modifierValue) * stacks;
      data.modifySpecificTalents.push(modifierItem);
    } else if (modifierItem.modifier === "Talent") {
      const talentVal = talentModifierValue(modifierItem, talentData?.[modifierItem.modifierValueTalentRef ?? ""] ?? "10");
      if (modifierItem.modifierTalentKey != null && talentVal != null) data[modifierItem.modifierTalentKey] = talentVal * stacks;
    } else if (modifierItem.modifier) {
      data[modifierItem.modifier] = Number(modifierItem.modifierValue) * stacks;
    }
  });
  return data;
}

/** `echoSetDataByLabel` of OptimizerWorkspaceSetup.vue: per set label, the merged passive stats. */
export function computeEchoSetPassiveBuffs(record: Plain, setFilters: string[]): Record<string, Record<string, number>> {
  // echoSetPassiveStats[setKey][passiveKey], as the screen collects them…
  const bySet: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const setBonus of getSetBonusEffectsFromListOfSetKeys(setFilters) as Plain[]) {
    bySet[setBonus.key] ??= {};
    for (const passive of (setBonus.passives ?? []) as Plain[]) {
      bySet[setBonus.key][passive.key] = setPassiveStats(record, passive);
    }
  }
  // …then echoSetPassiveStatsByLabel + echoSetDataByLabel.
  const result: Record<string, Record<string, number>> = {};
  for (const [setKey, passives] of Object.entries(bySet)) {
    const merged: Record<string, number> = {};
    Object.values(passives).forEach((passiveStats) => {
      Object.entries(passiveStats).forEach(([stat, value]) => {
        if (!merged[stat]) merged[stat] = 0;
        merged[stat] += value as number;
      });
    });
    result[getSetLabelByKey(setKey) ?? setKey] = merged;
  }
  return result;
}

/** `mainEchoStats` of OptimizerWorkspaceSetup.vue: per chosen main echo, its merged buff stats. */
export function computeMainEchoStats(record: Plain, characterId: string, mainEchoKeys: string[]): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const echoKey of mainEchoKeys) {
    if (!(mainEchoesData as Plain)[echoKey]) continue;
    const echo = getEchoData(echoKey) as Plain;
    const byBuff: Record<string, Record<string, unknown>> = {};
    for (const buff of getMainEchoBuffs({
      key: echo.key,
      details: echo.details,
      modifiers: echo.modifiers,
      hasStacks: echo.hasStacks,
      minStacks: echo.minStacks,
      maxStacks: echo.maxStacks,
    })) {
      const resolved = resolveOptimizerBuff({
        optimizerEntry: getMainEchoBuffEntry(record.optimizer?.mainEchoBuffs?.[echoKey] ?? {}, buff.key),
        calculatorEntry: getCalculatorMainEchoBuffEntry(record.mainEcho ?? {}, echoKey, buff.key),
        hasStacks: Boolean(buff.hasStacks),
        alwaysEnabled: Boolean(buff.alwaysEnabled),
        calculatorFallback: true,
      });
      byBuff[buff.key] = resolved.isEnabled
        ? (applyMainEchoBuffEffects({
            effects: buff.effects,
            character: characterId,
            hasStacks: buff.hasStacks,
            stacks: resolved.stacks,
            talentData: record.talents ?? {},
          }) as Record<string, unknown>)
        : {};
    }
    result[echoKey] = mergeMainEchoBuffStats(byBuff);
  }
  return result;
}
