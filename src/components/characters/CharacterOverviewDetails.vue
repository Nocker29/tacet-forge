<template>
  <AppChooserModal
    ref="modalRef"
    :title="character ? `${character.name}'s build` : ''"
    max-width-class="max-w-5xl"
    close-test-attr="data-test-character-details-close"
    @close="emit('close')">
    <template v-if="character">
      <div class="flex flex-col gap-4" data-test-character-details>
        <div class="flex items-center gap-3 min-w-0">
          <CharacterAvatar
            :character-key="character.key"
            :name="character.name"
            :rarity="character.rarity"
            size-class="size-16" />
          <div class="min-w-0 flex-1">
            <div class="text-lg font-semibold truncate">{{ character.name }}</div>
            <div class="text-sm opacity-70 flex items-center gap-2 flex-wrap">
              <span>Lv. {{ level }}</span>
              <span class="badge badge-sm badge-ghost">S{{ sequence }}</span>
              <span>{{ character.element }} · {{ character.weapon }}</span>
              <span v-if="activeBuildName" class="truncate" :title="activeBuildName">
                · {{ activeBuildName }}
              </span>
            </div>
          </div>
          <div
            v-if="buildScore"
            class="badge shrink-0"
            :class="buildScoreClass"
            :title="`Build Score — average Substat Score of the equipped echoes${buildScore.provisional ? ' (provisional)' : ''}`">
            {{ buildScore.grade }} {{ Math.round(buildScore.percent) }}%{{ buildScore.provisional ? "*" : "" }}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex flex-col gap-4 min-w-0">
            <section aria-labelledby="character-details-weapon">
              <h4 id="character-details-weapon" class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
                Weapon
              </h4>
              <div v-if="weapon" class="h-[200px]">
                <CalculatorBuildCardWeaponPanel
                  :name="weapon.name"
                  :image="weapon.image"
                  :rarity="weapon.rarity"
                  :level="weapon.level"
                  :refinement="weapon.refinement"
                  :attack="weapon.attack"
                  :modifier-label="weapon.modifier ? (subStatLabelMap[weapon.modifier] ?? null) : null"
                  :modifier-image="weapon.modifier ? (subStatIconMap[weapon.modifier] ?? null) : null"
                  :modifier-value="weapon.modifierValue" />
              </div>
              <div v-else-if="isLoading" class="skeleton h-[200px] w-full"></div>
              <div v-else class="rounded-lg bg-base-200 p-4 text-sm opacity-60">No weapon selected</div>
            </section>

            <section aria-labelledby="character-details-sets">
              <h4 id="character-details-sets" class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
                Echo sets
              </h4>
              <div v-if="activeSets.length" class="flex flex-wrap gap-2">
                <div
                  v-for="set in activeSets"
                  :key="set.key"
                  class="flex items-center gap-2 rounded-lg bg-base-200 px-3 py-2 min-w-0">
                  <AppImage :src="set.icon" alt="" class="size-6 shrink-0" />
                  <span class="text-sm font-semibold truncate">{{ set.count }}pc {{ set.label }}</span>
                </div>
              </div>
              <div v-else class="text-sm opacity-60">No active set bonus</div>
            </section>
          </div>

          <section aria-labelledby="character-details-stats" class="min-w-0">
            <h4 id="character-details-stats" class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
              Stats
            </h4>
            <p class="text-xs opacity-60 mb-2">
              Equipment and permanent bonuses only, like the build card — conditional,
              team and custom buffs aren't included.
            </p>
            <CalculatorStats
              v-if="stats"
              :character="character.key"
              :character-level="String(level)"
              :weapon-atk="weapon?.attack ?? 0"
              :total-atk="stats.totalAtk ?? 0"
              :total-atk-percent="stats.attackPercent ?? 0"
              :total-atk-flat="stats.attackFlat ?? 0"
              :total-hp="stats.totalHp ?? 0"
              :total-hp-percent="stats.hpPercent ?? 0"
              :total-hp-flat="stats.hpFlat ?? 0"
              :total-def="stats.totalDef ?? 0"
              :total-def-percent="stats.defPercent ?? 0"
              :total-def-flat="stats.defFlat ?? 0"
              :total-crit-rate="(stats.critRate ?? 0) / 100"
              :total-crit-dmg="(stats.critDMG ?? 0) / 100"
              :energy-regen="stats.energyRegen ?? 0"
              :basic-attack-dmg-bonus="stats.basicAttackDMGBonus ?? 0"
              :heavy-attack-dmg-bonus="stats.heavyAttackDMGBonus ?? 0"
              :resonance-skill-dmg-bonus="stats.resonanceSkillDMGBonus ?? 0"
              :resonance-liberation-dmg-bonus="stats.resonanceLiberationDMGBonus ?? 0"
              :glacio="stats.glacio ?? 0"
              :fusion="stats.fusion ?? 0"
              :electro="stats.electro ?? 0"
              :aero="stats.aero ?? 0"
              :spectro="stats.spectro ?? 0"
              :havoc="stats.havoc ?? 0"
              :healing-bonus="stats.healingBonus ?? 0"
              :tune-break-boost="tuneBreakBoost"
              :element-filter="character.element"
              :clickable="false" />
            <div v-else-if="isLoading" class="skeleton h-64 w-full"></div>
            <div v-else class="alert alert-error text-sm">{{ error ?? "Stats unavailable" }}</div>
          </section>
        </div>

        <section aria-labelledby="character-details-echoes">
          <h4 id="character-details-echoes" class="text-[.65rem] font-bold uppercase tracking-wider opacity-50 mb-2">
            Echoes ({{ equippedCount }}/5)
          </h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
            <template v-for="(echo, index) in echoes" :key="index">
              <CalculatorOptimizerResultLoadoutEcho
                v-if="echo?.echo"
                v-bind="echo"
                :echo-id="echo.echoId ?? ''"
                :hide-inventory="true" />
              <div
                v-else
                class="rounded-lg border border-dashed border-base-300 p-4 text-xs opacity-50 flex items-center justify-center min-h-20">
                Empty slot {{ index + 1 }}
              </div>
            </template>
          </div>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="btn btn-sm"
          data-test-character-details-open-optimizer
          @click="character && emit('open-optimizer', character.key)">
          Open in optimizer
        </button>
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-test-character-details-open-calculator
          @click="character && emit('open-calculator', character.key)">
          Open in calculator
        </button>
      </div>
    </template>
  </AppChooserModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  countEquippedEchoes,
  getCharacterLevel,
  getSequenceLevel,
  describeActiveEchoSets,
  type ListedCharacter,
} from "../../characters/characterOverview";
import { subStatIconMap, subStatLabelMap } from "../../echoes/stats";
import { useCharacterOverview } from "../../composables/useCharacterOverview";
import { useTeamSubstatScoreRollup } from "../../composables/useTeamSubstatScoreRollup";
import { getRatingBadgeClasses } from "../../composables/useEchoRating";
import AppChooserModal from "../AppChooserModal.vue";
import AppImage from "../AppImage.vue";
import CalculatorBuildCardWeaponPanel from "../CalculatorBuildCardWeaponPanel.vue";
import CalculatorOptimizerResultLoadoutEcho from "../CalculatorOptimizerResultLoadoutEcho.vue";
import CalculatorStats from "../CalculatorStats.vue";
import CharacterAvatar from "./CharacterAvatar.vue";

const props = defineProps<{ character: ListedCharacter | null }>();
const emit = defineEmits<{
  close: [];
  "open-calculator": [key: string];
  "open-optimizer": [key: string];
}>();

const modalRef = ref<InstanceType<typeof AppChooserModal> | null>(null);

// Priority: the user is waiting on this one, don't queue it behind the cards.
const { record, echoes, stats, tuneBreakBoost, weapon, isLoading, error } = useCharacterOverview(
  () => props.character?.key,
  { priority: true },
);
const { rollup: buildScore } = useTeamSubstatScoreRollup(() => props.character?.key);
const buildScoreClass = computed(() =>
  buildScore.value ? getRatingBadgeClasses(buildScore.value.color) : null,
);

const level = computed(() => getCharacterLevel(record.value));
const sequence = computed(() => getSequenceLevel(record.value?.resonanceChains));
const equippedCount = computed(() => countEquippedEchoes(echoes.value));
const activeBuildName = computed(() => {
  const builds: Array<{ id: string; name?: string }> = record.value?.builds ?? [];
  if (builds.length < 2) return null;
  return builds.find((build) => build.id === record.value?.activeBuildId)?.name ?? null;
});
const activeSets = computed(() => describeActiveEchoSets(echoes.value));

function triggerOpenModal() {
  return modalRef.value?.triggerOpenModal();
}
function triggerCloseModal() {
  modalRef.value?.triggerCloseModal();
}

defineExpose({ triggerOpenModal, triggerCloseModal });
</script>
