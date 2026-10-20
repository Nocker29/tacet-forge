/**
 * Protected characters (Tacet Forge): which other characters' echoes the
 * optimizer may take. Replaces upstream's per-character "Ignore echoes
 * equipped by other resonators" toggle.
 *
 * A character "holds" an echo when the inventory's `equipped` map lists them
 * for it, or when the echo is in the saved preset assigned to them
 * (`equippedPresets`). Every holder other than the optimized character is
 * either protected (their echoes are excluded) or a donor (their echoes are
 * usable). Only donors are stored, so a character that gets echoes later is
 * protected by default. An echo is excluded when ANY of its holders is
 * protected, unless the optimized character holds it too (it's already theirs,
 * same as upstream's toggle).
 *
 * Stored as `inventory.optimizerProtection = { donors: string[] }`, so it
 * travels with the inventory in the JSON backup.
 */

export type EquippedMap = Record<string, Record<string, number> | null | undefined>;
export type EquippedPresetsMap = Record<string, string | null | undefined>;
export interface EchoPresetLike {
  presetId: string;
  echo1Id?: string | null;
  echo2Id?: string | null;
  echo3Id?: string | null;
  echo4Id?: string | null;
  echo5Id?: string | null;
}

export interface OptimizerProtectionState {
  donors: string[];
}

/**
 * Keeps echoes in one of `setFilters` (every set when it's empty) — the
 * optimizer's set filter, shared by the run (Calculator.vue) and the run bar's
 * count so they can't drift. Apply `filterEchoesForOptimizer` first.
 */
export function filterEchoesBySets<T extends { echoSet?: string | null }>(
  echoes: readonly T[],
  setFilters: readonly string[],
): T[] {
  if (!setFilters.length) return [...echoes];
  const allowed = new Set(setFilters);
  return echoes.filter((echo) => allowed.has(echo.echoSet ?? ""));
}

/** echoId → characters holding it (equipped, or in their assigned preset). */
export function getEchoHolders(
  equipped: EquippedMap | null | undefined,
  equippedPresets: EquippedPresetsMap | null | undefined,
  echoPresets: readonly EchoPresetLike[] | null | undefined,
): Map<string, Set<string>> {
  const holders = new Map<string, Set<string>>();
  const add = (echoId: string | null | undefined, character: string) => {
    if (!echoId || !character) return;
    let set = holders.get(echoId);
    if (!set) {
      set = new Set();
      holders.set(echoId, set);
    }
    set.add(character);
  };

  for (const [echoId, charMap] of Object.entries(equipped ?? {})) {
    for (const character of Object.keys(charMap ?? {})) add(echoId, character);
  }

  const presetsById = new Map((echoPresets ?? []).map((preset) => [preset.presetId, preset]));
  for (const [character, presetId] of Object.entries(equippedPresets ?? {})) {
    const preset = presetId ? presetsById.get(presetId) : undefined;
    if (!preset) continue;
    for (const echoId of [preset.echo1Id, preset.echo2Id, preset.echo3Id, preset.echo4Id, preset.echo5Id]) {
      add(echoId, character);
    }
  }
  return holders;
}

/** Characters that hold at least one echo, minus the optimized one, sorted. */
export function listProtectionCandidates(
  holders: Map<string, Set<string>>,
  optimizedCharacter?: string | null,
): string[] {
  const characters = new Set<string>();
  for (const set of holders.values()) for (const character of set) characters.add(character);
  if (optimizedCharacter) characters.delete(optimizedCharacter);
  return [...characters].sort((a, b) => a.localeCompare(b));
}

/**
 * Echo ids the optimizer must skip for `optimizedCharacter`, each mapped to the
 * protected characters that hold it (for "excluded by …" summaries).
 */
export function getProtectedEchoIds(
  holders: Map<string, Set<string>>,
  donors: readonly string[],
  optimizedCharacter: string | null | undefined,
): Map<string, string[]> {
  const donorSet = new Set(donors);
  const excluded = new Map<string, string[]>();
  for (const [echoId, set] of holders) {
    if (optimizedCharacter && set.has(optimizedCharacter)) continue;
    const protectedHolders = [...set].filter((character) => !donorSet.has(character));
    if (protectedHolders.length) excluded.set(echoId, protectedHolders);
  }
  return excluded;
}

/**
 * How many of `echoIds` (the echoes the optimizer would otherwise consider)
 * are excluded, and by whom (most first). An echo held by two protected
 * characters counts once in the total and once for each of them.
 */
export function summarizeProtection(
  echoIds: readonly string[],
  excluded: Map<string, string[]>,
): { total: number; excludedCount: number; byCharacter: Array<{ character: string; count: number }> } {
  const counts = new Map<string, number>();
  let excludedCount = 0;
  for (const echoId of echoIds) {
    const holders = excluded.get(echoId);
    if (!holders) continue;
    excludedCount += 1;
    for (const character of holders) counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  const byCharacter = [...counts.entries()]
    .map(([character, count]) => ({ character, count }))
    .sort((a, b) => b.count - a.count || a.character.localeCompare(b.character));
  return { total: echoIds.length, excludedCount, byCharacter };
}

/** Other characters (donors) a loadout takes echoes from, with counts. */
export function getLoadoutDonors(
  echoIds: ReadonlyArray<string | null | undefined>,
  holders: Map<string, Set<string>>,
  optimizedCharacter: string | null | undefined,
): Array<{ character: string; count: number }> {
  const counts = new Map<string, number>();
  for (const echoId of echoIds) {
    const set = echoId ? holders.get(echoId) : undefined;
    if (!set || (optimizedCharacter && set.has(optimizedCharacter))) continue;
    for (const character of set) counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([character, count]) => ({ character, count }))
    .sort((a, b) => b.count - a.count || a.character.localeCompare(b.character));
}

/** Toggle one character between protected and donor. */
export function toggleDonor(donors: readonly string[], character: string): string[] {
  return donors.includes(character)
    ? donors.filter((donor) => donor !== character)
    : [...donors, character].sort((a, b) => a.localeCompare(b));
}

/** Make every listed candidate a donor (others keep their state). */
export function unlockCandidates(donors: readonly string[], candidates: readonly string[]): string[] {
  return [...new Set([...donors, ...candidates])].sort((a, b) => a.localeCompare(b));
}

/** Protect every listed candidate (donors outside the list are kept). */
export function protectCandidates(donors: readonly string[], candidates: readonly string[]): string[] {
  const candidateSet = new Set(candidates);
  return donors.filter((donor) => !candidateSet.has(donor));
}

/** Flip every listed candidate; donors outside the list are kept. */
export function invertCandidates(donors: readonly string[], candidates: readonly string[]): string[] {
  const donorSet = new Set(donors);
  const candidateSet = new Set(candidates);
  const kept = donors.filter((donor) => !candidateSet.has(donor));
  const flipped = candidates.filter((candidate) => !donorSet.has(candidate));
  return [...kept, ...flipped].sort((a, b) => a.localeCompare(b));
}

/**
 * Initial donors for data saved before this feature, from upstream's
 * per-character `optimizer.ignoreOtherResonantorEchoes` toggle:
 * - any character with it on → everyone protected (the safe reading);
 * - otherwise any character with it explicitly off → everyone who currently
 *   holds echoes is a donor (matches how the optimizer behaved);
 * - never set → the new default, everyone protected.
 */
export function deriveLegacyDonors(
  characters: Record<string, { optimizer?: { ignoreOtherResonantorEchoes?: unknown } } | null | undefined> | null | undefined,
  holders: Map<string, Set<string>>,
): string[] {
  // The settings component's prop also accepted strings, so read "true"/"false" too.
  const values = Object.values(characters ?? {}).map((record) =>
    String(record?.optimizer?.ignoreOtherResonantorEchoes),
  );
  if (values.includes("true")) return [];
  if (values.includes("false")) return listProtectionCandidates(holders);
  return [];
}

/** Normalizes whatever is stored (or nothing) to a state, or null when absent. */
export function readProtectionState(raw: unknown): OptimizerProtectionState | null {
  if (!raw || typeof raw !== "object") return null;
  const donors = (raw as { donors?: unknown }).donors;
  if (!Array.isArray(donors)) return null;
  return { donors: donors.filter((donor): donor is string => typeof donor === "string") };
}
