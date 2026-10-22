/**
 * Tacet Forge data migrations, on a timeline separate from upstream's
 * (src/migrations/index.ts), so merging upstream never collides with ours:
 * upstream's numbers stay upstream's, ours live under their own key.
 *
 * Order on startup (main.ts): normalizeForkDataVersion → runMigrations →
 * runForkMigrations. Imports call markForkDataCurrent after applying the
 * backup (applyImportedDatabase).
 *
 * To add a fork migration: add `fork/00N_description.ts` default-exporting a
 * Migration with `version: N`, append it below and bump
 * CURRENT_FORK_DATA_VERSION. Fork migrations must be idempotent.
 */
import { DATA_VERSION_KEY } from "./index";
import { hasPersistedUserData, type Migration } from "./types";
import addOptimizerProtection from "./fork/001_addOptimizerProtection";

export const FORK_DATA_VERSION_KEY = "tacetForgeDataVersion";
export const CURRENT_FORK_DATA_VERSION = 1;

const forkMigrations: Migration[] = [addOptimizerProtection];

/**
 * The fork's first release stamped upstream's data version as 10 for its own
 * migration. Upstream will ship its own 10 one day, and a profile stamped 10
 * would skip it, so a profile that never ran the fork track yet goes back to 9
 * (the last upstream version that existed then). Runs before runMigrations.
 */
export function normalizeForkDataVersion() {
  if (localStorage.getItem(FORK_DATA_VERSION_KEY) != null) return;
  if (localStorage.getItem(DATA_VERSION_KEY) === "10") {
    localStorage.setItem(DATA_VERSION_KEY, "9");
  }
}

function readForkVersion(): number {
  const parsed = Number(localStorage.getItem(FORK_DATA_VERSION_KEY));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function markForkDataCurrent() {
  localStorage.setItem(FORK_DATA_VERSION_KEY, String(CURRENT_FORK_DATA_VERSION));
}

/** Runs pending fork migrations. Empty profiles are left untouched. */
export function runForkMigrations() {
  if (typeof window !== "undefined" && (window as any)?.Cypress) return;
  const version = readForkVersion();
  if (version >= CURRENT_FORK_DATA_VERSION) return;
  if (localStorage.getItem(FORK_DATA_VERSION_KEY) == null && !hasPersistedUserData()) return;
  for (const migration of forkMigrations) {
    if (migration.version > version) migration.up();
  }
  markForkDataCurrent();
}

/**
 * Backups exported by the fork's first release say `meta.version: "10"` and
 * have no `meta.forkDataVersion` (later fork exports do). Among unmarked v10
 * backups only those carry `optimizerProtection` (upstream's never do), so
 * those are read as version 9; anything else keeps its version.
 */
export function normalizeImportedDataVersion(
  dataVersion: number,
  meta: { forkDataVersion?: unknown } | null | undefined,
  inventoryPayload: unknown,
): number {
  if (dataVersion !== 10 || meta?.forkDataVersion != null) return dataVersion;
  const raw = typeof inventoryPayload === "string" ? inventoryPayload : JSON.stringify(inventoryPayload ?? null);
  return raw.includes('"optimizerProtection"') ? 9 : dataVersion;
}
