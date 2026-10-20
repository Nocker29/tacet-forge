/**
 * Calculator screens a link may open directly with `/?screen=<name>` (used by
 * the Characters page's "Open in optimizer"). Anything else falls back to the
 * character screen, so a stale or hand-typed link can't leave a blank view.
 */
const LINKABLE_SCREENS = new Set([
  "character",
  "weapon",
  "echoes",
  "constellations",
  "party",
  "optimizer",
  "rotations",
  "custom-buffs",
  "enemy",
]);

export function resolveInitialCalculatorScreen(query: unknown): string {
  const value = Array.isArray(query) ? query[0] : query;
  return typeof value === "string" && LINKABLE_SCREENS.has(value) ? value : "character";
}
