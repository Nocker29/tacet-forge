/**
 * Tacet Forge: spotting imported echoes that aren't fully levelled (25).
 *
 * Only an explicit numeric `level` on the echo counts. The substat count is
 * not a level: scanners export level-25 echoes with 4 substats on purpose,
 * and today's formats (echo JSON lists, Discord build cards, scans) carry no
 * level at all, so such echoes are never flagged.
 */
export const MAX_ECHO_LEVEL = 25;

type EchoLike = Record<string, unknown>;

/** Keys a level might be stored under in an echo list (none of today's formats has one). */
const LEVEL_KEYS = ["level", "lvl", "echoLevel"] as const;

/** The echo's level when its data says so, else null. */
export function echoLevel(echo: EchoLike): number | null {
  for (const key of LEVEL_KEYS) {
    const raw = echo[key];
    if (raw == null || raw === "") continue;
    const level = Number(raw);
    if (Number.isFinite(level)) return level;
  }
  return null;
}

export function isBelowMaxLevel(echo: EchoLike): boolean {
  const level = echoLevel(echo);
  return level != null && level < MAX_ECHO_LEVEL;
}

export interface LowLevelEchoes {
  /** Indexes (into the list given) of echoes below level 25. */
  indexes: Set<number>;
  /** One line per level, highest first, e.g. "3 at level 20". */
  breakdown: string[];
}

/** Echoes below level 25; `include` leaves out entries that aren't echoes (e.g. empty card slots). */
export function findLowLevelEchoes(
  echoes: EchoLike[],
  include: (echo: EchoLike) => boolean = () => true,
): LowLevelEchoes {
  const indexes = new Set<number>();
  const byLevel = new Map<number, number>();
  echoes.forEach((echo, index) => {
    if (!echo || !include(echo) || !isBelowMaxLevel(echo)) return;
    indexes.add(index);
    const level = echoLevel(echo)!;
    byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
  });
  const breakdown = [...byLevel].sort(([a], [b]) => b - a).map(([level, count]) => `${count} at level ${level}`);
  return { indexes, breakdown };
}
