/**
 * Shared logic behind Settings' export/import/delete flows — extracted so
 * the legacy Settings UI and the v3.0 "Backup & Restore" workspace panel
 * call the exact same data-correctness-critical code instead of each
 * carrying their own copy that could drift out of sync over time.
 *
 * Version 1 — character payload only (no meta wrapper)
 * Version 2 — { meta, data: { character, inventory } }
 * Version 3+ — schema migrations (see src/migrations); still uses the v2 shape
 * Version 5+ — data also includes { teamRotations }
 *
 * On import we apply pending transforms from meta.version, then mark current.
 */
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { useTeamRotationsStore } from "../stores/teamRotations";
import { randomString } from "./strings";
import { buildIdentityKeySet, getEchoIdentityKey } from "./echoIdentity";
import { findIncomingDuplicates } from "../echoes/duplicateCleanup";
import { clearEchoesFromCharacters } from "../echoes/clearEchoes";
import {
  applyMigrationTransforms,
  CURRENT_DATA_VERSION,
  getExportDataVersion,
  hasNestedExportFormat,
  parseMetaDataVersion,
  setStoredDataVersion,
} from "../migrations";
import {
  CURRENT_FORK_DATA_VERSION,
  markForkDataCurrent,
  normalizeImportedDataVersion,
} from "../migrations/fork";

/**
 * Gets all of the data to save
 */
export function getExportData() {
  const meta = {
    version: String(getExportDataVersion()),
    source: "WutheringTools",
    // Tacet Forge: our own migration timeline (src/migrations/fork.ts).
    forkDataVersion: String(CURRENT_FORK_DATA_VERSION),
  };
  const data = {
    character: localStorage.getItem("character"),
    inventory: localStorage.getItem("inventory"),
    teamRotations: localStorage.getItem("teamRotations"),
  };
  return {
    meta,
    data,
  };
}

/**
 * Gets a filename for the exported JSON file
 */
export function generateExportFilename() {
  const date = new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = dateFormatter.formatToParts(date);
  const partsValues = {
    month: "",
    day: "",
    year: "",
  };
  parts.forEach(({ type, value }) => {
    if (type === "month") {
      partsValues.month = value;
    }
    if (type === "day") {
      partsValues.day = value;
    }
    if (type === "year") {
      partsValues.year = value;
    }
  });
  const dateStr = `${partsValues.year}-${partsValues.month}-${partsValues.day}`;
  return `character_data_${dateStr}.json`;
}

/**
 * Provides the data to import based on changes to the structures
 */
export function getImportData(data: string | object, toParse = false) {
  let parsedData: unknown = data;
  if (toParse) {
    parsedData = JSON.parse(data as string);
  }
  const returnData: {
    character: unknown;
    inventory: unknown;
    teamRotations: unknown;
    dataVersion: number;
  } = {
    character: undefined,
    inventory: undefined,
    teamRotations: undefined,
    dataVersion: 1,
  };
  const pd = parsedData as {
    meta?: { version?: string | number; forkDataVersion?: unknown };
    data?: { character?: unknown; inventory?: unknown; teamRotations?: unknown };
  };
  if (pd?.meta && hasNestedExportFormat(pd.meta)) {
    returnData.character = pd?.data?.character;
    returnData.inventory = pd?.data?.inventory;
    returnData.teamRotations = pd?.data?.teamRotations;
    returnData.dataVersion = normalizeImportedDataVersion(
      parseMetaDataVersion(pd.meta),
      pd.meta,
      pd?.data?.inventory,
    );
  } else {
    returnData.character = parsedData;
    returnData.inventory = { echoes: [], equipped: {} };
    returnData.dataVersion = 1;
  }
  return returnData;
}

export function parseStorePayload(payload: unknown, fromDataVersion: number): unknown {
  let value = payload;
  if (typeof value === "string") {
    value = JSON.parse(applyMigrationTransforms(value, fromDataVersion));
  } else if (value != null && typeof value === "object") {
    value = JSON.parse(
      applyMigrationTransforms(JSON.stringify(value), fromDataVersion),
    );
  }
  return value;
}

export function isJsonString(str: string | null) {
  if (str == null) return false;
  try {
    JSON.parse(str);
  } catch {
    return false;
  }
  return true;
}

/**
 * Parses a raw export/import payload and overwrites character, inventory,
 * and teamRotations store state with it.
 */
export function applyImportedDatabase(raw: string) {
  const importData = getImportData(raw, true);
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamRotationsStore = useTeamRotationsStore();

  characterStore.hardSetState(
    parseStorePayload(importData.character, importData.dataVersion) as never,
  );
  inventoryStore.hardSetState(
    parseStorePayload(importData.inventory, importData.dataVersion) as never,
  );
  // Backups from before protected characters: seed them from the imported
  // characters' old ignore-equipped toggles (fork migration 1 can't, see there).
  inventoryStore.ensureOptimizerProtection();
  // Older exports (pre-version-5) never had team data — hardSetState
  // already treats undefined as "no teams" via `data?.teams ?? []`.
  teamRotationsStore.hardSetState(
    parseStorePayload(importData.teamRotations, importData.dataVersion) as never,
  );
  // Transforms above bring data to the latest schema
  setStoredDataVersion(CURRENT_DATA_VERSION);
  markForkDataCurrent();
}

/**
 * Parses a raw list of echoes and adds them to the inventory (additive,
 * does not touch existing echoes). When some are exact copies of inventory
 * echoes (or repeat within the list), `decideDuplicates` picks whether to
 * skip them, import them anyway, or cancel (null). Returns how many were
 * imported and skipped, or null when cancelled.
 */
export async function importEchoesFromRaw(
  rawText: string,
  inventoryStore: ReturnType<typeof useInventoryStore>,
  decideDuplicates: (duplicateCount: number, totalCount: number) => Promise<"skip" | "import" | null> = async () =>
    "import",
): Promise<{ imported: number; skipped: number } | null> {
  const normalized = applyMigrationTransforms(rawText);
  const parsed = JSON.parse(normalized) as unknown[];
  const duplicates = findIncomingDuplicates(
    parsed,
    buildIdentityKeySet(inventoryStore.echoes as never[]),
    (echo) => ((echo as { echo?: unknown })?.echo ? getEchoIdentityKey(echo as never) : null),
  );
  let data = parsed;
  if (duplicates.size) {
    const choice = await decideDuplicates(duplicates.size, parsed.length);
    if (choice == null) return null;
    if (choice === "skip") data = parsed.filter((_, index) => !duplicates.has(index));
  }
  let amount = 0;
  for (const echo of data) {
    let id = randomString();
    const anyCollisions = inventoryStore.echoById(id);
    if (anyCollisions.length > 0) {
      id = randomString();
    }
    const echoItem = {
      echoId: id,
      ...(echo as object),
    };
    await inventoryStore.saveEcho(echoItem as never);
    amount++;
  }
  return { imported: amount, skipped: parsed.length - amount };
}

/**
 * Danger Zone → "Delete all echoes": empties the echo inventory, the equipped
 * map and echo presets, and clears echo slots in every character and saved
 * build. Characters, weapons, buffs, rotations, teams, settings and the
 * protected-characters list stay.
 */
export function clearAllEchoes() {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  characterStore.characters = clearEchoesFromCharacters(characterStore.characters) as never;
  // Function form: object-form $patch would merge `{}` into the old maps.
  inventoryStore.$patch((state: Record<string, unknown>) => {
    state.echoes = [];
    state.equipped = {};
    state.echoPresets = [];
    state.equippedPresets = {};
  });
}

/**
 * Resets character and inventory data to a blank state.
 */
export function clearAllUserData() {
  localStorage.setItem("character", "");
  const characterStore = useCharacterStore();
  characterStore.$hydrate({ runHooks: false });
  localStorage.setItem("inventory", "");
  const inventoryStore = useInventoryStore();
  inventoryStore.$hydrate({ runHooks: false });
}
