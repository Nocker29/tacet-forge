<template>
  <div class="optimizer-protected flex flex-col gap-2" data-test-optimizer-protected>
    <div class="flex items-start justify-between gap-2 flex-wrap">
      <div class="min-w-0">
        <h3 id="optimizer-protected-title" class="text-sm font-semibold">Protected characters</h3>
        <p class="text-xs opacity-60">
          The optimizer won't take echoes from protected characters
          <span aria-hidden="true">(🔒)</span>. Dimmed characters are donors: their echoes can be used.
        </p>
      </div>
      <div v-if="candidates.length" class="join shrink-0" role="group" aria-label="Change all at once">
        <button
          type="button"
          class="btn btn-xs join-item"
          :disabled="protectedCount === candidates.length"
          data-test-optimizer-protect-all
          @click="setDonors(protectCandidates(donors, candidates))">
          Protect all
        </button>
        <button
          type="button"
          class="btn btn-xs join-item"
          :disabled="protectedCount === 0"
          data-test-optimizer-unlock-all
          @click="setDonors(unlockCandidates(donors, candidates))">
          Unlock all
        </button>
        <button
          type="button"
          class="btn btn-xs join-item"
          data-test-optimizer-invert
          @click="setDonors(invertCandidates(donors, candidates))">
          Invert
        </button>
      </div>
    </div>

    <p v-if="!candidates.length" class="text-xs opacity-60 rounded-lg bg-base-100 p-3" data-test-optimizer-protected-empty>
      <template v-if="holderCount">
        No other character's echoes are in the eligible echo sets, so there's nothing to protect.
      </template>
      <template v-else>
        No other character has echoes equipped or a preset assigned, so every echo is available.
      </template>
    </p>
    <div
      v-else
      class="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1.5 max-h-64 overflow-y-auto p-0.5"
      role="group"
      aria-labelledby="optimizer-protected-title">
      <button
        v-for="entry in entries"
        :key="entry.key"
        type="button"
        class="optimizer-protected__item flex flex-col items-center gap-0.5 rounded-lg p-1 min-w-0 transition hover:bg-base-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        :aria-pressed="entry.isProtected"
        :aria-label="`${entry.name}: ${entry.isProtected ? 'protected' : 'donor'}, ${entry.echoCount} ${entry.echoCount === 1 ? 'echo' : 'echoes'}`"
        :title="`${entry.name} — ${entry.isProtected ? 'protected: echoes excluded' : 'donor: echoes can be used'} (${entry.echoCount})`"
        :data-test-optimizer-protected-character="entry.key"
        :data-test-optimizer-protected-state="entry.isProtected ? 'protected' : 'donor'"
        @click="setDonors(toggleDonor(donors, entry.key))">
        <span class="relative">
          <CharacterAvatar
            :character-key="entry.key"
            :name="entry.name"
            :rarity="entry.rarity"
            size-class="size-10"
            :class="{ 'opacity-40 grayscale': !entry.isProtected }" />
          <span
            v-if="entry.isProtected"
            class="absolute -bottom-1 -right-1 rounded-full bg-base-100 p-0.5 text-warning"
            aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="size-3">
              <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
            </svg>
          </span>
        </span>
        <span class="text-[.65rem] leading-tight w-full truncate text-center" :class="{ 'opacity-50': !entry.isProtected }">
          {{ entry.name }}
        </span>
      </button>
    </div>

    <div
      class="text-xs rounded-lg bg-base-100 px-3 py-2"
      aria-live="polite"
      data-test-optimizer-protected-summary>
      <span class="font-semibold">{{ summary.total - summary.excludedCount }}</span>
      of {{ summary.total }} echoes available<template v-if="summary.excludedCount">,
        <span class="font-semibold">{{ summary.excludedCount }}</span> excluded
        <span class="opacity-70">({{ excludedByText }})</span></template>.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useInventoryStore } from "../stores/inventory";
import { allCharactersList, getCharacterRosterDisplayName } from "../characters/characters";
import { filterEchoesForOptimizer } from "../calculator/optimizer";
import {
  countHeldEchoes,
  filterEchoesBySets,
  invertCandidates,
  protectCandidates,
  summarizeProtection,
  toggleDonor,
  unlockCandidates,
} from "../echoes/optimizerProtection";
import CharacterAvatar from "./characters/CharacterAvatar.vue";

defineOptions({ name: "OptimizerProtectedCharacters" });

const props = defineProps<{
  character: string;
  /** The optimizer's eligible echo sets; empty means every set. */
  setFilters?: string[];
}>();

const inventoryStore = useInventoryStore();
const { echoes } = storeToRefs(inventoryStore);

const rosterByKey = new Map(allCharactersList.map((entry) => [entry.key, entry]));
const nameOf = getCharacterRosterDisplayName;

const donors = computed<string[]>(() => inventoryStore.optimizerDonors);
const holders = computed<string[]>(() => inventoryStore.protectionCandidates(props.character));
const holderCount = computed(() => holders.value.length);

// Echoes this run could use: same filters as the run itself (Calculator.vue),
// so stale ids, "ignore in optimizer" echoes and other sets don't count.
const optimizerEchoIds = computed(() =>
  filterEchoesBySets(
    filterEchoesForOptimizer(echoes.value ?? []) as Array<{ echoId: string; echoSet?: string | null }>,
    props.setFilters ?? [],
  ).map((echo) => echo.echoId),
);

const echoCounts = computed(() => countHeldEchoes(optimizerEchoIds.value, inventoryStore.echoHolders));

// Only characters holding at least one usable echo: protecting the rest
// changes nothing. Their stored protected/donor state is left as is, and the
// "all" buttons only touch the characters shown.
const candidates = computed(() => holders.value.filter((key) => echoCounts.value.has(key)));

const entries = computed(() => {
  const donorSet = new Set(donors.value);
  return candidates.value
    .map((key) => ({
      key,
      name: nameOf(key),
      rarity: rosterByKey.get(key)?.rarity ?? 4,
      echoCount: echoCounts.value.get(key) ?? 0,
      isProtected: !donorSet.has(key),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const protectedCount = computed(() => entries.value.filter((entry) => entry.isProtected).length);

const summary = computed(() =>
  summarizeProtection(optimizerEchoIds.value, inventoryStore.protectedEchoIds(props.character)),
);

const excludedByText = computed(() => {
  const shown = summary.value.byCharacter.slice(0, 4).map(({ character, count }) => `${nameOf(character)} ${count}`);
  const rest = summary.value.byCharacter.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
});

function setDonors(next: string[]) {
  inventoryStore.setOptimizerDonors(next);
}
</script>
