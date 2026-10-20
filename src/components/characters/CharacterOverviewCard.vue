<template>
  <button
    type="button"
    class="character-overview-card group w-full text-left rounded-xl bg-base-200 p-3 flex flex-col gap-3 min-w-0 border border-transparent transition-colors hover:border-base-content/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    :aria-label="`View ${character.name}'s build`"
    :data-test-character-overview-card="character.key"
    @click="emit('open', character.key)">
    <div class="flex items-center gap-3 min-w-0">
      <CharacterAvatar
        :character-key="character.key"
        :name="character.name"
        :rarity="character.rarity"
        size-class="size-14" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            class="font-semibold truncate"
            :class="character.rarity === 5 ? 'text-amber-300' : 'text-violet-400'"
            :title="character.name">
            {{ character.name }}
          </span>
          <img
            v-if="elementIcon"
            :src="elementIcon"
            :alt="character.element"
            class="size-4 shrink-0"
            :class="`${character.element.toLowerCase()}--active`" />
        </div>
        <div class="text-xs opacity-70 flex items-center gap-2 flex-wrap">
          <span data-test-character-overview-level>Lv. {{ level }}</span>
          <span class="badge badge-sm badge-ghost" data-test-character-overview-sequence>S{{ sequence }}</span>
          <span class="inline-flex items-center gap-1">
            <span class="size-2 rounded-full" :class="statusDotClass"></span>
            {{ statusLabel }}
          </span>
        </div>
      </div>
      <div
        v-if="buildScore"
        class="badge badge-sm shrink-0"
        :class="buildScoreClass"
        :title="`Build Score — average Substat Score of the equipped echoes${buildScore.provisional ? ' (provisional)' : ''}`"
        data-test-character-overview-score>
        {{ buildScore.grade }} {{ Math.round(buildScore.percent) }}%{{ buildScore.provisional ? "*" : "" }}
      </div>
    </div>

    <div class="flex items-center gap-2 min-w-0 text-sm" data-test-character-overview-weapon>
      <template v-if="weapon">
        <AppImage :src="weapon.image" :alt="weapon.name" class="size-8 shrink-0 rounded bg-base-300" />
        <span class="truncate" :title="weapon.name">{{ weapon.name }}</span>
        <span class="text-xs opacity-60 shrink-0">R{{ weapon.refinement }}</span>
      </template>
      <span v-else-if="isLoading" class="skeleton h-8 w-40"></span>
      <span v-else class="opacity-50 text-xs">No weapon</span>
    </div>

    <div class="flex items-center gap-2 flex-wrap min-h-6 text-xs" data-test-character-overview-sets>
      <template v-if="activeSets.length">
        <span
          v-for="set in activeSets"
          :key="set.key"
          class="inline-flex items-center gap-1 rounded bg-base-300 px-1.5 py-0.5 max-w-full"
          :title="`${set.count}pc ${set.label}`">
          <AppImage :src="set.icon" :alt="''" class="size-4 shrink-0" />
          <span class="truncate">{{ set.count }}pc {{ set.label }}</span>
        </span>
      </template>
      <span v-else class="opacity-50">
        {{ equippedCount ? `${equippedCount}/5 echoes, no set bonus` : "No echoes equipped" }}
      </span>
    </div>

    <dl
      class="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums"
      data-test-character-overview-stats>
      <template v-if="stats">
        <div v-for="row in statRows" :key="row.label" class="flex justify-between gap-2 min-w-0">
          <dt class="opacity-60 truncate">{{ row.label }}</dt>
          <dd class="whitespace-nowrap">{{ row.value }}</dd>
        </div>
      </template>
      <template v-else-if="isLoading">
        <span v-for="n in 6" :key="n" class="skeleton h-4 w-full"></span>
      </template>
      <span v-else class="col-span-2 text-error/80">{{ error ?? "Stats unavailable" }}</span>
    </dl>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { characterElementsSetImageMap } from "../../characters/characters";
import {
  countEquippedEchoes,
  getCharacterLevel,
  getSequenceLevel,
  summarizeActiveEchoSets,
  type ListedCharacter,
} from "../../characters/characterOverview";
import {
  getCharacterBuildStatus,
  getCharacterBuildStatusDotClass,
  getCharacterBuildStatusLabel,
} from "../../characters/characterBuildStatus";
import { getEchoSetIconByType, getEchoSetLabelByType } from "../../echoes/stats";
import { useCharacterOverview } from "../../composables/useCharacterOverview";
import { useTeamSubstatScoreRollup } from "../../composables/useTeamSubstatScoreRollup";
import { getRatingBadgeClasses } from "../../composables/useEchoRating";
import { useCharacterStore } from "../../stores/character";
import { displayInt, displayPercentage } from "../../utils/numbers";
import AppImage from "../AppImage.vue";
import CharacterAvatar from "./CharacterAvatar.vue";

const props = defineProps<{ character: ListedCharacter }>();
const emit = defineEmits<{ open: [key: string] }>();

const characterStore = useCharacterStore();
const { record, echoes, stats, weapon, isLoading, error } = useCharacterOverview(
  () => props.character.key,
);
const { rollup: buildScore } = useTeamSubstatScoreRollup(() => props.character.key);

const elementIcon = computed(() => characterElementsSetImageMap[props.character.element] ?? null);
const level = computed(() => getCharacterLevel(record.value));
const sequence = computed(() => getSequenceLevel(record.value?.resonanceChains));
const status = computed(() =>
  getCharacterBuildStatus(props.character.key, characterStore.characters ?? {}),
);
const statusLabel = computed(() => getCharacterBuildStatusLabel(status.value));
const statusDotClass = computed(() => getCharacterBuildStatusDotClass(status.value));
const buildScoreClass = computed(() =>
  buildScore.value ? getRatingBadgeClasses(buildScore.value.color) : null,
);
const equippedCount = computed(() => countEquippedEchoes(record.value));
const statRows = computed(() => {
  const s = stats.value ?? {};
  return [
    { label: "ATK", value: displayInt(s.totalAtk ?? 0) },
    { label: "HP", value: displayInt(s.totalHp ?? 0) },
    { label: "Crit Rate", value: displayPercentage(s.critRate ?? 0) },
    { label: "Crit DMG", value: displayPercentage(s.critDMG ?? 0) },
    { label: "ER", value: displayPercentage((s.energyRegen ?? 0) * 100) },
    { label: "DEF", value: displayInt(s.totalDef ?? 0) },
  ];
});
const activeSets = computed(() =>
  summarizeActiveEchoSets(echoes.value).map((set) => ({
    ...set,
    label: getEchoSetLabelByType(set.key),
    icon: getEchoSetIconByType(set.key),
  })),
);
</script>
