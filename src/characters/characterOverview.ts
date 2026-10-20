/**
 * Pure helpers behind the Characters page (Tacet Forge): which characters the
 * user has saved, their sequence, active echo sets, and filtering/sorting.
 * Reads the character store's records as-is; nothing here writes or copies them.
 */
import { getSetBonusThreshold } from "../echoes/sets";
import { getCharacterBuildStatus } from "./characterBuildStatus";

export interface ListedCharacter {
  key: string;
  name: string;
  element: string;
  rarity: number;
  weapon: string;
}

export type CharacterSortKey = "name" | "element" | "weapon" | "level" | "sequence" | "rarity";

export interface CharacterOverviewFilters {
  search?: string;
  element?: string | null;
  weapon?: string | null;
  hideWontBuild?: boolean;
  sort?: CharacterSortKey;
}

type CharacterRecord = Record<string, any>;

/**
 * Characters that have a record in the character store (i.e. the user opened
 * or configured them), restricted to the released roster in `roster` order.
 * Records for keys not in the roster (removed or unreleased characters) are
 * skipped rather than shown half-broken.
 */
export function listSavedCharacters(
  characters: Record<string, CharacterRecord | undefined> | null | undefined,
  roster: readonly ListedCharacter[],
): ListedCharacter[] {
  if (!characters) return [];
  return roster.filter((character) => {
    const record = characters[character.key];
    return record != null && typeof record === "object";
  });
}

/**
 * Sequence (S0–S6) from a stored `resonanceChains` toggle map. Chain keys
 * start with `SequenceNode<N>` (several entries can share one node), so the
 * sequence is the highest node with any entry enabled.
 */
export function getSequenceLevel(
  resonanceChains: Record<string, { isEnabled?: boolean } | undefined> | null | undefined,
): number {
  let sequence = 0;
  for (const [key, value] of Object.entries(resonanceChains ?? {})) {
    if (!value?.isEnabled) continue;
    const node = Number(/^SequenceNode(\d+)/.exec(key)?.[1] ?? 0);
    if (node > sequence) sequence = node;
  }
  return Math.min(sequence, 6);
}

/** Character level as a number ("90" → 90; missing → 90, the store's default). */
export function getCharacterLevel(record: CharacterRecord | null | undefined): number {
  const level = Number.parseInt(String(record?.characterLevel ?? "90"), 10);
  return Number.isFinite(level) ? level : 90;
}

/**
 * Echo sets whose piece count reaches their bonus threshold (2pc/5pc, or 1pc
 * and 3pc for the sets that use those), most pieces first. Same rule as the
 * build card's set summary.
 */
export function summarizeActiveEchoSets(
  echoes: ReadonlyArray<{ echoSet?: string | null } | null | undefined>,
): Array<{ key: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const echo of echoes) {
    const key = echo?.echoSet;
    if (key && key !== "none") counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .filter(([key, count]) => count >= getSetBonusThreshold(key))
    .sort(([keyA, a], [keyB, b]) => b - a || keyA.localeCompare(keyB))
    .map(([key, count]) => ({ key, count }));
}

/** How many of the 5 echo slots hold an echo (inventory link or inline data). */
export function countEquippedEchoes(record: CharacterRecord | null | undefined): number {
  let count = 0;
  for (let index = 0; index < 5; index++) {
    const slot = record?.echoes?.[index];
    if (slot?.echoId || slot?.echo) count += 1;
  }
  return count;
}

export function filterAndSortCharacters(
  list: readonly ListedCharacter[],
  characters: Record<string, CharacterRecord | undefined>,
  filters: CharacterOverviewFilters = {},
): ListedCharacter[] {
  const needle = filters.search?.trim().toLowerCase() ?? "";
  const result = list.filter((character) => {
    if (needle && !character.name.toLowerCase().includes(needle)) return false;
    if (filters.element && character.element !== filters.element) return false;
    if (filters.weapon && character.weapon !== filters.weapon) return false;
    if (
      filters.hideWontBuild &&
      getCharacterBuildStatus(character.key, characters) === "wont-build"
    ) {
      return false;
    }
    return true;
  });

  const byName = (a: ListedCharacter, b: ListedCharacter) => a.name.localeCompare(b.name);
  const sort = filters.sort ?? "name";
  const compare: Record<CharacterSortKey, typeof byName> = {
    name: byName,
    element: (a, b) => a.element.localeCompare(b.element) || byName(a, b),
    weapon: (a, b) => a.weapon.localeCompare(b.weapon) || byName(a, b),
    level: (a, b) =>
      getCharacterLevel(characters[b.key]) - getCharacterLevel(characters[a.key]) || byName(a, b),
    sequence: (a, b) =>
      getSequenceLevel(characters[b.key]?.resonanceChains) -
        getSequenceLevel(characters[a.key]?.resonanceChains) || byName(a, b),
    rarity: (a, b) => b.rarity - a.rarity || byName(a, b),
  };
  return result.sort(compare[sort]);
}
