/**
 * Tacet Forge: "Remove duplicates" in Inventory → Echoes and the duplicate
 * question on import. Pure; the identity key is the same one "Find
 * duplicates" uses (getEchoIdentityKey: echo, set, main stat, substats).
 */

export interface DuplicateCandidate {
  echoId: string;
  echo?: string | null;
  favorite?: boolean;
  locked?: boolean;
}

/**
 * Which copies to delete so each group of exact duplicates keeps one. Kept
 * without question: copies a character holds (equipped or in their preset —
 * deleting them would change a build) and locked copies. A group with none of
 * those keeps its first favorite, else its oldest copy (inventory order).
 */
export function planDuplicateRemoval<T extends DuplicateCandidate>(
  echoes: readonly T[],
  identityKey: (echo: T) => string,
  isHeld: (echoId: string) => boolean,
): { removeIds: string[]; groupCount: number } {
  const groups = new Map<string, T[]>();
  for (const echo of echoes) {
    if (!echo.echo) continue;
    const key = identityKey(echo);
    const group = groups.get(key);
    if (group) group.push(echo);
    else groups.set(key, [echo]);
  }

  const removeIds: string[] = [];
  let groupCount = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep = group.filter((echo) => isHeld(echo.echoId) || echo.locked);
    if (!keep.length) keep.push(group.find((echo) => echo.favorite) ?? group[0]);
    const extra = group.filter((echo) => !keep.includes(echo));
    if (!extra.length) continue;
    groupCount += 1;
    removeIds.push(...extra.map((echo) => echo.echoId));
  }
  return { removeIds, groupCount };
}

/**
 * Indexes of `incoming` echoes that duplicate one already in the inventory or
 * an earlier one in the same batch (so importing a list twice over adds each
 * echo once when duplicates are skipped).
 */
export function findIncomingDuplicates<T>(
  incoming: readonly T[],
  inventoryKeys: ReadonlySet<string>,
  identityKey: (echo: T) => string | null,
): Set<number> {
  const seen = new Set(inventoryKeys);
  const duplicates = new Set<number>();
  incoming.forEach((echo, index) => {
    const key = identityKey(echo);
    if (key == null) return;
    if (seen.has(key)) duplicates.add(index);
    else seen.add(key);
  });
  return duplicates;
}
