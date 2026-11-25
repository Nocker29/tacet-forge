/**
 * Tacet Forge: spotting imported echoes that aren't fully levelled (25).
 *
 * No import format carries an echo level: echo JSON lists (Import echoes,
 * exports from other tools), Discord build cards and scans only have the
 * substats. An echo unlocks one substat every 5 levels, so fewer than 5
 * filled substats means it is below 25. A numeric `level` field, if a list
 * ever has one, wins over the inference.
 */
export const MAX_ECHO_LEVEL = 25;

type EchoLike = Record<string, unknown>;

export function filledSubstatCount(echo: EchoLike): number {
  let count = 0;
  for (let n = 1; n <= 5; n++) {
    const type = echo[`echoSubStatsType${n}`];
    if (typeof type === "string" && type !== "" && type !== "none") count++;
  }
  return count;
}

/** The echo's level when its data says so, else null. */
function explicitLevel(echo: EchoLike): number | null {
  const level = Number(echo.level);
  return echo.level != null && echo.level !== "" && Number.isFinite(level) ? level : null;
}

export function isBelowMaxLevel(echo: EchoLike): boolean {
  const level = explicitLevel(echo);
  return level != null ? level < MAX_ECHO_LEVEL : filledSubstatCount(echo) < 5;
}

export interface LowLevelEchoes {
  /** Indexes (into the list given) of echoes below level 25. */
  indexes: Set<number>;
  /** True when any of them was judged by its substat count (no level in the data). */
  inferred: boolean;
  /** One line per group, e.g. "3 with 4 substats (level 20–24)". */
  breakdown: string[];
}

/** Echoes below level 25; `include` leaves out entries that aren't echoes (e.g. empty card slots). */
export function findLowLevelEchoes(
  echoes: EchoLike[],
  include: (echo: EchoLike) => boolean = () => true,
): LowLevelEchoes {
  const indexes = new Set<number>();
  let inferred = false;
  const bySubstats = new Map<number, number>();
  const byLevel = new Map<number, number>();
  echoes.forEach((echo, index) => {
    if (!echo || !include(echo) || !isBelowMaxLevel(echo)) return;
    indexes.add(index);
    const level = explicitLevel(echo);
    if (level != null) {
      byLevel.set(level, (byLevel.get(level) ?? 0) + 1);
    } else {
      inferred = true;
      const substats = filledSubstatCount(echo);
      bySubstats.set(substats, (bySubstats.get(substats) ?? 0) + 1);
    }
  });
  const breakdown = [
    ...[...byLevel].sort(([a], [b]) => b - a).map(([level, count]) => `${count} at level ${level}`),
    ...[...bySubstats]
      .sort(([a], [b]) => b - a)
      .map(([substats, count]) => {
        const range = substats === 0 ? "level 0–4" : `level ${substats * 5}–${substats * 5 + 4}`;
        return `${count} with ${substats} substat${substats === 1 ? "" : "s"} (${range})`;
      }),
  ];
  return { indexes, inferred, breakdown };
}
