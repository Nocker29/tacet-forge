/**
 * Tacet Forge agent tool: the character state the app's calculator saves when
 * it renders a character, derived here so a backup gives the same numbers as
 * the app whether or not that character was last opened there (and after
 * `apply` changes its echoes).
 *
 * On mount the calculator (CalculatorEchoes.vue + its echo tiles and
 * CalculatorMainEchoBuff.vue) saves:
 *  - `mainEcho.echo`: the echo in slot 1 (`main-echo:updated`);
 *  - `echoSetBonus`: getSetBonusEffects of the slots' sets, unless the user
 *    turned on the set override (`updateEchoSets`);
 *  - `mainEcho.buffs[key] = { isEnabled: true }` for each always-on buff of
 *    that echo (the `alwaysEnabled` watcher).
 * buildCharacterCalculationContext and the optimizer screen read exactly
 * these, so they are filled in the same way before calculating.
 */
import { resolveCharacterEchoes } from "../calculator/buildCharacterContext";
import { getSetBonusEffects } from "../echoes/sets";
import { mainEchoesData } from "../echoes/index";
import { getMainEchoBuffs, type MainEchoState } from "../echoes/mainEchoBuffs";

type Plain = Record<string, any>;

/** The record as the calculator leaves it after rendering (a copy; input untouched). */
export function withCalculatorState(record: Plain, inventoryEchoes: Plain[]): Plain {
  const slots = resolveCharacterEchoes(record.echoes, inventoryEchoes);
  const next: Plain = { ...record };

  if (!record.setOverride) {
    const sets = slots.map((echo) => (echo?.echoSet as string | undefined) ?? null);
    const { setBonusOnePiece, setBonusOne, setBonusTwo } = getSetBonusEffects(sets);
    next.echoSetBonus = { ...(record.echoSetBonus ?? {}), setBonusOnePiece, setBonusOne, setBonusTwo };
  }

  const mainEchoKey = (slots[0]?.echo as string | undefined) ?? null;
  const mainEcho: MainEchoState & Plain = { ...(record.mainEcho ?? {}), echo: mainEchoKey ?? undefined };
  if (!mainEchoKey) delete mainEcho.echo;
  const echoDef = mainEchoKey ? (mainEchoesData as Plain)[mainEchoKey] : null;
  for (const buff of getMainEchoBuffs(echoDef)) {
    if (!buff.alwaysEnabled) continue;
    mainEcho.buffs = { ...(mainEcho.buffs ?? {}), [buff.key]: { ...(mainEcho.buffs?.[buff.key] ?? {}), isEnabled: true } };
  }
  next.mainEcho = mainEcho;
  return next;
}

/** `characters` with one character replaced by its calculator state. */
export function withCalculatorStateFor(characters: Record<string, Plain>, characterId: string, inventoryEchoes: Plain[]) {
  const record = characters[characterId];
  if (!record) return characters;
  return { ...characters, [characterId]: withCalculatorState(record, inventoryEchoes) };
}

/** The fields to save so a stored record matches its calculator state. */
export function calculatorStatePatch(record: Plain, inventoryEchoes: Plain[]): Plain {
  const derived = withCalculatorState(record, inventoryEchoes);
  return { echoSetBonus: derived.echoSetBonus, mainEcho: derived.mainEcho };
}
