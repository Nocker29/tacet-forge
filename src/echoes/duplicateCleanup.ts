/**
 * Tacet Forge: "Find/Remove duplicates" in Inventory → Echoes and the
 * duplicate question on import. Pure.
 *
 * Two kinds of duplicate:
 * - exact: same echo, set, cost, rarity, main stat and substats
 *   (`getDuplicateKey`, which ignores substat order, missing vs empty slots
 *   and number formatting such as "9.40" vs 9.4);
 * - older copy (`findOlderCopies`): the same echo whose filled substats are a
 *   strict subset of another copy's — usually the same in-game echo imported
 *   before and after upgrading it.
 */

export interface EchoFields {
  echo?: unknown;
  echoSet?: unknown;
  type?: unknown;
  rank?: unknown;
  stat?: unknown;
  [field: string]: unknown;
}

function normalizeValue(value: unknown): string {
  if (value == null || value === "") return "";
  const number = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(number) ? String(number) : String(value).trim();
}

/** Filled substats as "Type=value", sorted; empty or "none" slots are skipped. */
export function getSubstatEntries(echo: EchoFields): string[] {
  const entries: string[] = [];
  for (let slot = 1; slot <= 5; slot++) {
    const type = echo[`echoSubStatsType${slot}`];
    if (!type || type === "none") continue;
    entries.push(`${String(type)}=${normalizeValue(echo[`echoSubStatsValue${slot}`])}`);
  }
  return entries.sort();
}

/** Echo, set, cost, rarity and main stat: what every copy of one in-game echo shares. */
export function getEchoBaseKey(echo: EchoFields): string {
  return [echo.echo, echo.echoSet, normalizeValue(echo.type), normalizeValue(echo.rank), echo.stat]
    .map((part) => (part == null ? "" : String(part)))
    .join("|");
}

/** Exact-duplicate key (see the file comment for what's normalized). */
export function getDuplicateKey(echo: EchoFields): string {
  return `${getEchoBaseKey(echo)}|${getSubstatEntries(echo).join(",")}`;
}

/**
 * Older copies: echoId → echoId of the most-upgraded copy whose substats
 * include all of this one's (and more). Exact duplicates aren't listed here.
 */
export function findOlderCopies<T extends EchoFields & { echoId: string }>(echoes: readonly T[]): Map<string, string> {
  const byBase = new Map<string, Array<{ id: string; subs: string[] }>>();
  for (const echo of echoes) {
    if (!echo.echo) continue;
    const base = getEchoBaseKey(echo);
    const list = byBase.get(base) ?? [];
    list.push({ id: echo.echoId, subs: getSubstatEntries(echo) });
    byBase.set(base, list);
  }
  const older = new Map<string, string>();
  for (const copies of byBase.values()) {
    if (copies.length < 2) continue;
    const mostUpgradedFirst = [...copies].sort((a, b) => b.subs.length - a.subs.length);
    for (const copy of copies) {
      const newer = mostUpgradedFirst.find(
        (other) => other.subs.length > copy.subs.length && copy.subs.every((entry) => other.subs.includes(entry)),
      );
      if (newer) older.set(copy.id, newer.id);
    }
  }
  return older;
}

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
  olderCopies?: ReadonlyMap<string, string>,
): { removeIds: string[]; groupCount: number; olderIds: string[] } {
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
  // Older copies (opt-in): only free ones, and only while the newer copy stays.
  const removing = new Set(removeIds);
  const olderIds: string[] = [];
  for (const echo of echoes) {
    const newerId = olderCopies?.get(echo.echoId);
    if (!newerId || removing.has(echo.echoId) || removing.has(newerId)) continue;
    if (isHeld(echo.echoId) || echo.locked) continue;
    olderIds.push(echo.echoId);
  }
  return { removeIds, groupCount, olderIds };
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
