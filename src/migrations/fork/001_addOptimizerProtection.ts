import type { Migration } from "../types";
import {
  deriveLegacyDonors,
  getEchoHolders,
  readProtectionState,
} from "../../echoes/optimizerProtection";

/**
 * Tacet Forge: protected characters replace the per-character "Ignore echoes
 * equipped by other resonators" toggle. Seeds `inventory.optimizerProtection`
 * from the old toggles (see deriveLegacyDonors): on anywhere → everyone
 * protected; explicitly off → everyone holding echoes is a donor.
 *
 * Needs both the character and inventory stores, so there's no per-store
 * `transform`: an imported backup gets the same seeding from
 * `inventoryStore.ensureOptimizerProtection()` in `applyImportedDatabase`.
 * Idempotent: does nothing when the field is already set.
 *
 * Fork migration 1 (src/migrations/fork.ts). It shipped first as upstream-track
 * data version 10; `normalizeForkDataVersion` undoes that stamp.
 */
export function seedOptimizerProtection(characterJson: string | null, inventoryJson: string): string {
  let inventory: Record<string, unknown>;
  try {
    inventory = JSON.parse(inventoryJson);
  } catch {
    return inventoryJson;
  }
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) return inventoryJson;
  if (readProtectionState(inventory.optimizerProtection)) return inventoryJson;

  let characters: Record<string, any>;
  try {
    characters = (characterJson ? JSON.parse(characterJson) : {})?.characters ?? {};
  } catch {
    characters = {};
  }
  const holders = getEchoHolders(
    inventory.equipped as never,
    inventory.equippedPresets as never,
    inventory.echoPresets as never,
  );
  inventory.optimizerProtection = { donors: deriveLegacyDonors(characters, holders) };
  return JSON.stringify(inventory);
}

const migration: Migration = {
  version: 1,
  description:
    "Seed protected characters (inventory.optimizerProtection) from the old per-character ignore-equipped toggle",
  up() {
    const inventory = localStorage.getItem("inventory");
    if (!inventory) return;
    const next = seedOptimizerProtection(localStorage.getItem("character"), inventory);
    if (next !== inventory) localStorage.setItem("inventory", next);
  },
};

export default migration;
