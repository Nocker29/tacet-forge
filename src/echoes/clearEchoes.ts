/**
 * Tacet Forge: Danger Zone → "Delete all echoes". Pure: returns the character
 * store's `characters` with every echo slot emptied (the live record and each
 * saved build) and preset links removed, everything else untouched.
 */
import { createEmptyEchoSlot } from "./echoLoadout";

type CharacterRecord = Record<string, any>;

function emptySlots() {
  return Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index), createEmptyEchoSlot()]));
}

function stripEchoes(fields: CharacterRecord): CharacterRecord {
  const next = { ...fields };
  if ("echoes" in next) next.echoes = emptySlots();
  if ("echoPresetId" in next) next.echoPresetId = null;
  return next;
}

export function clearEchoesFromCharacters(
  characters: Record<string, CharacterRecord | null | undefined>,
): Record<string, CharacterRecord | null | undefined> {
  return Object.fromEntries(
    Object.entries(characters ?? {}).map(([key, record]) => {
      if (!record || typeof record !== "object") return [key, record];
      const next = stripEchoes(record);
      if (Array.isArray(record.builds)) next.builds = record.builds.map(stripEchoes);
      return [key, next];
    }),
  );
}
