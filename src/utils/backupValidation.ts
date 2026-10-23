/**
 * Tacet Forge: shape checks for data coming from a backup file or stored in
 * localStorage, before it reaches the stores. Deliberately structural and
 * lenient (unknown fields pass, numeric strings pass) so real old backups
 * still load, but strict where bad data would break the app or end up in
 * tooltip HTML: wrong container types, non-numeric text in numeric echo
 * fields, prototype keys.
 */

export type CheckResult = { ok: true } | { ok: false; error: string };

const OK: CheckResult = { ok: true };
const fail = (error: string): CheckResult => ({ ok: false, error });

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const NUMERIC_ECHO_FIELDS = ["type", "rank", ...[1, 2, 3, 4, 5].map((n) => `echoSubStatsValue${n}`)];
const TEXT_ECHO_FIELDS = ["echo", "echoSet", "stat", ...[1, 2, 3, 4, 5].map((n) => `echoSubStatsType${n}`)];

type Plain = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Plain {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

const isOptional = (value: unknown) => value === undefined || value === null;
const isNumberLike = (value: unknown) =>
  isOptional(value) ||
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value));
const isTextOrEmpty = (value: unknown) => isOptional(value) || typeof value === "string";
const isStringArray = (value: unknown) =>
  isOptional(value) || (Array.isArray(value) && value.every((item) => typeof item === "string"));

/** True when `__proto__`/`constructor`/`prototype` appear as keys anywhere. */
export function hasForbiddenKeys(value: unknown, depth = 0): boolean {
  if (depth > 64 || value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenKeys(item, depth + 1));
  return Object.keys(value).some((key) => FORBIDDEN_KEYS.has(key) || hasForbiddenKeys((value as Plain)[key], depth + 1));
}

/** One echo's own fields: text where text is expected, numbers where numbers are. */
function checkEchoFields(echo: Plain, where: string): CheckResult {
  for (const field of NUMERIC_ECHO_FIELDS) {
    if (!isNumberLike(echo[field])) return fail(`${where}: "${field}" must be a number.`);
  }
  for (const field of TEXT_ECHO_FIELDS) {
    if (!isTextOrEmpty(echo[field])) return fail(`${where}: "${field}" must be text.`);
  }
  if (!isTextOrEmpty(echo.echoId)) return fail(`${where}: "echoId" must be text.`);
  return OK;
}

/** An inventory echo: a plain object with a non-empty `echoId` and sane fields. */
export function checkInventoryEcho(echo: unknown, where: string): CheckResult {
  if (!isPlainObject(echo)) return fail(`${where} is not an echo.`);
  if (typeof echo.echoId !== "string" || !echo.echoId) return fail(`${where} has no echo id.`);
  return checkEchoFields(echo, where);
}

/** An echo from an "Import echoes" list (no id yet; one is assigned on import). */
export function checkImportedEcho(echo: unknown, where: string): CheckResult {
  if (!isPlainObject(echo)) return fail(`${where} is not an echo.`);
  if (typeof echo.echo !== "string" || !echo.echo) return fail(`${where} has no echo name.`);
  return checkEchoFields(echo, where);
}

function checkEchoSlots(slots: unknown, where: string): CheckResult {
  if (isOptional(slots)) return OK;
  const values = Array.isArray(slots) ? slots : isPlainObject(slots) ? Object.values(slots) : null;
  if (!values) return fail(`${where}: echo slots have the wrong format.`);
  for (const slot of values) {
    if (isOptional(slot)) continue;
    if (!isPlainObject(slot)) return fail(`${where}: an echo slot has the wrong format.`);
    const result = checkEchoFields(slot, where);
    if (!result.ok) return result;
  }
  return OK;
}

export function checkCharacterState(state: unknown): CheckResult {
  if (isOptional(state)) return OK;
  if (!isPlainObject(state)) return fail("Characters: wrong format.");
  if (!isOptional(state.characters) && !isPlainObject(state.characters)) return fail("Characters: wrong format.");
  if (!isTextOrEmpty(state.activeCharacter)) return fail("Characters: the active character must be text.");
  if (!isStringArray(state.favoriteCharacters)) return fail("Characters: favorites must be a list of names.");
  for (const [key, record] of Object.entries((state.characters as Plain) ?? {})) {
    if (isOptional(record)) continue;
    if (!isPlainObject(record)) return fail(`Character "${key}": wrong format.`);
    const slots = checkEchoSlots(record.echoes, `Character "${key}"`);
    if (!slots.ok) return slots;
    if (!isOptional(record.builds) && !Array.isArray(record.builds)) return fail(`Character "${key}": builds must be a list.`);
    for (const build of (record.builds as unknown[]) ?? []) {
      if (!isPlainObject(build)) return fail(`Character "${key}": a build has the wrong format.`);
      const buildSlots = checkEchoSlots(build.echoes, `Character "${key}", build "${String(build.name ?? "")}"`);
      if (!buildSlots.ok) return buildSlots;
    }
  }
  return OK;
}

export function checkInventoryState(state: unknown): CheckResult {
  if (isOptional(state)) return OK;
  if (!isPlainObject(state)) return fail("Inventory: wrong format.");
  if (!isOptional(state.echoes) && !Array.isArray(state.echoes)) return fail("Inventory: echoes must be a list.");
  const ids = new Set<string>();
  for (const [index, echo] of ((state.echoes as unknown[]) ?? []).entries()) {
    const result = checkInventoryEcho(echo, `Inventory echo #${index + 1}`);
    if (!result.ok) return result;
    const id = (echo as Plain).echoId as string;
    if (ids.has(id)) return fail(`Inventory: echo id "${id}" appears twice.`);
    ids.add(id);
  }
  if (!isOptional(state.equipped)) {
    if (!isPlainObject(state.equipped)) return fail("Inventory: equipped echoes have the wrong format.");
    for (const holders of Object.values(state.equipped)) {
      if (isOptional(holders)) continue;
      if (!isPlainObject(holders) || !Object.values(holders).every(isNumberLike)) {
        return fail("Inventory: equipped echoes have the wrong format.");
      }
    }
  }
  if (!isOptional(state.echoPresets)) {
    if (!Array.isArray(state.echoPresets)) return fail("Inventory: echo presets must be a list.");
    for (const preset of state.echoPresets) {
      if (!isPlainObject(preset) || typeof preset.presetId !== "string") return fail("Inventory: an echo preset has the wrong format.");
      if (![1, 2, 3, 4, 5].every((n) => isTextOrEmpty(preset[`echo${n}Id`]))) return fail("Inventory: an echo preset has the wrong format.");
    }
  }
  if (!isOptional(state.equippedPresets)) {
    if (!isPlainObject(state.equippedPresets) || !Object.values(state.equippedPresets).every(isTextOrEmpty)) {
      return fail("Inventory: preset assignments have the wrong format.");
    }
  }
  const protection = state.optimizerProtection;
  if (!isOptional(protection) && !(isPlainObject(protection) && isStringArray(protection.donors))) {
    return fail("Inventory: protected characters have the wrong format.");
  }
  return OK;
}

export function checkTeamRotationsState(state: unknown): CheckResult {
  if (isOptional(state)) return OK;
  if (!isPlainObject(state)) return fail("Teams: wrong format.");
  if (!isOptional(state.teams) && !(Array.isArray(state.teams) && state.teams.every(isPlainObject))) {
    return fail("Teams: teams must be a list.");
  }
  if (!isStringArray(state.favoriteTeamIds) || !isStringArray(state.favoritePresetNames)) {
    return fail("Teams: favorites must be lists of text.");
  }
  return OK;
}

/** Runs the three store checks on already-parsed store states. */
export function checkStoreStates(states: { character: unknown; inventory: unknown; teamRotations: unknown }): CheckResult {
  for (const state of [states.character, states.inventory, states.teamRotations]) {
    if (hasForbiddenKeys(state)) return fail("The file contains unsafe keys.");
  }
  for (const result of [
    checkCharacterState(states.character),
    checkInventoryState(states.inventory),
    checkTeamRotationsState(states.teamRotations),
  ]) {
    if (!result.ok) return result;
  }
  return OK;
}
