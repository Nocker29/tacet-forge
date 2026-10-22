// Tacet Forge: our features read the game data registries instead of keeping
// their own lists, so a character or echo set added upstream should work in
// them without changes. These tests walk every entry so a merge that adds
// content proves it (see UPDATE-AI.md).
import { describe, it, expect } from "vitest";
import {
  allCharactersList,
  characterElementsSetImageMap,
  getCharacterRosterDisplayName,
  weaponTypesImageMap,
} from "../../src/characters/characters";
import {
  describeActiveEchoSets,
  filterAndSortCharacters,
  listSavedCharacters,
  pickNextActiveCharacter,
} from "../../src/characters/characterOverview";
import { echoSetLabelMap, getEchoSetIconByType } from "../../src/echoes/stats";
import { getSetBonusThreshold } from "../../src/echoes/sets";
import {
  countHeldEchoes,
  filterEchoesBySets,
  getEchoHolders,
  getProtectedEchoIds,
  listProtectionCandidates,
} from "../../src/echoes/optimizerProtection";

const roster = allCharactersList.map(({ key, name, element, rarity, weapon }) => ({ key, name, element, rarity, weapon }));
const setKeys = Object.keys(echoSetLabelMap);

describe("every character in the roster", () => {
  it("shows up on the Characters page once it has a record", () => {
    const records = Object.fromEntries(roster.map((character) => [character.key, {}]));
    expect(listSavedCharacters(records, roster)).toHaveLength(roster.length);
  });

  it.each(roster.map((character) => [character.key, character]))(
    "%s has a display name and element/weapon filters with icons",
    (key, character) => {
      expect(getCharacterRosterDisplayName(key)).toBeTruthy();
      expect(characterElementsSetImageMap[character.element]).toBeTruthy();
      expect(weaponTypesImageMap[character.weapon]).toBeTruthy();
      expect(
        filterAndSortCharacters([character], { [key]: {} }, { element: character.element, weapon: character.weapon }),
      ).toEqual([character]);
    },
  );

  it("can be picked as the next active character and protected in the optimizer", () => {
    const equipped = Object.fromEntries(roster.map((character, index) => [`e${index}`, { [character.key]: 0 }]));
    const holders = getEchoHolders(equipped, {}, []);
    const [optimized, ...others] = roster.map((character) => character.key);
    expect(listProtectionCandidates(holders, optimized)).toEqual([...others].sort((a, b) => a.localeCompare(b)));
    expect(getProtectedEchoIds(holders, [], optimized).size).toBe(roster.length - 1);
    expect(pickNextActiveCharacter(roster, [roster.at(-1)!.key])?.key).toBe(roster.at(-1)!.key);
  });
});

describe("every echo set", () => {
  it("is offered by the set filters, which count the sets from the same registry", () => {
    // Both optimizer UIs build their set buttons and "N/M sets" counter from
    // Object.keys(echoSetLabelMap), so the total grows with the data.
    expect(setKeys.length).toBeGreaterThan(0);
    expect(new Set(setKeys).size).toBe(setKeys.length);
  });

  it.each(setKeys)("%s has an icon, a label and works with the set filter and protection grid", (setKey) => {
    expect(getEchoSetIconByType(setKey)).toBeTruthy();
    const echoes = [
      { echoId: "in", echoSet: setKey },
      { echoId: "out", echoSet: setKey === "Other" ? "Another" : "Other" },
    ];
    const usable = filterEchoesBySets(echoes, [setKey]).map((echo) => echo.echoId);
    expect(usable).toEqual(["in"]);
    const holders = getEchoHolders({ in: { Jinhsi: 0 }, out: { Changli: 0 } }, {}, []);
    expect([...countHeldEchoes(usable, holders).keys()]).toEqual(["Jinhsi"]);

    const threshold = getSetBonusThreshold(setKey);
    const active = describeActiveEchoSets(Array.from({ length: threshold }, () => ({ echoSet: setKey })));
    expect(active).toEqual([
      { key: setKey, count: threshold, label: echoSetLabelMap[setKey], icon: getEchoSetIconByType(setKey) },
    ]);
  });
});
