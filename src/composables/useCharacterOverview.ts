/**
 * Read-only summary of one saved character for the Characters page: stat
 * totals, weapon and resolved echoes, computed from the stored build exactly
 * like the build card does (equipment + permanently active bonuses, no
 * situational buffs), via `buildCharacterCalculationContext`.
 *
 * Card loads run one at a time through a shared queue so opening the page with
 * 40+ characters doesn't load every character/weapon module at once. A load
 * that is superseded or whose card unmounted before its turn is skipped, and
 * `priority` loads (the details view) bypass the queue.
 */
import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import {
  buildCharacterCalculationContext,
  resolveCharacterEchoes,
} from "../calculator/buildCharacterContext";
import { computeTotalTuneBreakBoost } from "../calculator/stats";
import { getWeaponByName } from "../weapons/weapons";

export interface CharacterOverviewWeapon {
  key: string;
  name: string;
  rarity: number | string;
  image: string | null;
  level: string;
  refinement: string;
  attack: number;
  modifier: string | null;
  modifierValue: number | null;
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every task queued before it (failures don't block the queue). */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

const OVERVIEW_ENEMY = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };

export function useCharacterOverview(
  characterId: () => string | null | undefined,
  options: { priority?: boolean } = {},
) {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const { characters } = storeToRefs(characterStore);

  const record = computed(() => {
    const id = characterId();
    return id ? (characters.value?.[id] ?? null) : null;
  });

  const echoes = computed(() =>
    resolveCharacterEchoes(record.value?.echoes, inventoryStore.echoes ?? []),
  );

  const stats: Ref<Record<string, any> | null> = ref(null);
  const tuneBreakBoost = ref(0);
  const weapon: Ref<CharacterOverviewWeapon | null> = ref(null);
  const isLoading = ref(true);
  const error = ref<string | null>(null);

  let requestId = 0;
  let disposed = false;
  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
    });
  }

  async function load(id: string) {
    const built = await buildCharacterCalculationContext(
      id,
      characters.value,
      OVERVIEW_ENEMY,
      inventoryStore.echoes ?? [],
      { alwaysEnabledOnly: true },
    );
    const weaponKey: string | null = characters.value?.[id]?.weapon ?? null;
    let weaponSummary: CharacterOverviewWeapon | null = null;
    if (weaponKey) {
      // Module imports are cached, so this only reads the display info the
      // context doesn't return (name, rarity, image).
      const weaponType = built.chosenChar?.basic?.weapon ?? "Swords";
      const info = (await getWeaponByName(weaponType, weaponKey))?.info;
      if (info) {
        const stored = characters.value?.[id]?.weapons?.[weaponKey] ?? {};
        weaponSummary = {
          key: weaponKey,
          name: info.name ?? weaponKey,
          rarity: info.rarity ?? 0,
          image: info.image ?? null,
          level: String(stored.weaponLevel ?? info.maxLevel ?? "90"),
          refinement: String(stored.refinement ?? "1"),
          attack: built.weaponData.attack,
          modifier: built.weaponData.modifier,
          modifierValue: built.weaponData.modifierValue,
        };
      }
    }
    return {
      stats: built.finalStats,
      tuneBreakBoost: computeTotalTuneBreakBoost({
        baseTuneBreakBoost: built.chosenChar?.basic?.tuneBreakBoost ?? 0,
        echoStats: built.echoStats,
      }),
      weapon: weaponSummary,
    };
  }

  function clear() {
    stats.value = null;
    tuneBreakBoost.value = 0;
    weapon.value = null;
  }

  // The getter touches the whole inventory (resolving echo ids), so it fires
  // on unrelated inventory edits too; only recompute when this character's
  // record or its 5 echoes actually changed.
  let lastInput: string | null = null;
  watch(
    () => [characterId(), record.value, echoes.value] as const,
    async ([id, currentRecord, currentEchoes]) => {
      const input = JSON.stringify([id, currentRecord, currentEchoes]);
      if (input === lastInput) return;
      lastInput = input;

      const current = ++requestId;
      error.value = null;
      if (!id) {
        clear();
        isLoading.value = false;
        return;
      }
      isLoading.value = true;
      const isStale = () => disposed || current !== requestId;
      try {
        const run = () => (isStale() ? Promise.resolve(null) : load(id));
        const result = await (options.priority ? run() : enqueue(run));
        if (!result || isStale()) return;
        stats.value = result.stats;
        tuneBreakBoost.value = result.tuneBreakBoost;
        weapon.value = result.weapon;
      } catch (caught) {
        if (isStale()) return;
        console.error(`Could not compute stats for ${id}`, caught);
        error.value = "Couldn't calculate this character's stats.";
        clear();
      } finally {
        if (!isStale()) isLoading.value = false;
      }
    },
    { immediate: true, deep: true },
  );

  return { record, echoes, stats, tuneBreakBoost, weapon, isLoading, error };
}
