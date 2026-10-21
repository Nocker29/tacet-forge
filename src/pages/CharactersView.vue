<template>
  <Nav cur-page="characters" :disable-mobile-nav="true"></Nav>
  <div class="page-characters w-full px-4 py-6 md:px-6 lg:px-10 text-base-content">
    <header class="mb-6 max-w-4xl">
      <h1 class="text-2xl md:text-3xl font-semibold mb-2">Characters</h1>
      <p class="text-base-content/80 text-sm md:text-base">
        Every character you've set up, with their weapon, echoes and key stats at a glance.
      </p>
    </header>

    <div
      v-if="!savedCharacters.length"
      class="flex flex-col items-center justify-center text-center py-16 px-4 rounded-lg bg-base-200/60"
      data-test-characters-empty>
      <h2 class="text-lg font-semibold mb-1">No characters yet</h2>
      <p class="text-base-content/70 mb-4 max-w-md">
        Characters you open in the calculator show up here with their build.
      </p>
      <RouterLink to="/" class="btn btn-primary btn-sm">Open the calculator</RouterLink>
    </div>

    <template v-else>
      <AppFilterPanel
        panel-key="characters-overview"
        class="mb-4"
        :active-count="activeFilterCount"
        :clear-disabled="!activeFilterCount"
        @clear="resetFilters">
        <template #bar>
          <input
            v-model="search"
            type="search"
            placeholder="Search characters…"
            class="input input-bordered input-sm flex-1 min-w-40"
            aria-label="Search characters"
            data-test-characters-search />
          <label class="flex items-center gap-2 text-xs">
            <span class="opacity-70 whitespace-nowrap">Sort by</span>
            <select
              v-model="sort"
              class="select select-bordered select-sm"
              aria-label="Sort characters"
              data-test-characters-sort>
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </template>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex flex-wrap" role="group" aria-label="Filter by element">
            <button
              v-for="(elementIcon, element) in characterElementsSetImageMap"
              :key="element"
              type="button"
              class="rounded mr-1"
              :class="{ 'btn-active': filterElement === element }"
              :aria-pressed="filterElement === element"
              :aria-label="`${element} characters`"
              :data-test-characters-element="element"
              @click="filterElement = filterElement === element ? null : element">
              <img :src="elementIcon" alt="" class="size-8" :class="`${element.toLowerCase()}--active`" />
            </button>
          </div>
          <div class="flex flex-wrap" role="group" aria-label="Filter by weapon">
            <button
              v-for="(weaponIcon, weaponType) in weaponTypesImageMap"
              :key="weaponType"
              type="button"
              class="rounded mr-1"
              :class="{ 'btn-active': filterWeapon === weaponType }"
              :aria-pressed="filterWeapon === weaponType"
              :aria-label="`${weaponType} users`"
              :data-test-characters-weapon="weaponType"
              @click="filterWeapon = filterWeapon === weaponType ? null : weaponType">
              <img :src="weaponIcon.toLowerCase()" alt="" class="size-8 p-[.15rem]" />
            </button>
          </div>
          <label
            class="flex items-center gap-1.5 cursor-pointer text-xs whitespace-nowrap"
            title="Hide characters marked “Won't build”. This preference is saved globally.">
            <input
              v-model="hideWontBuildCharacters"
              type="checkbox"
              class="toggle toggle-primary toggle-sm"
              aria-label="Hide characters marked Won't build"
              data-test-characters-hide-wont-build />
            Hide “Won't build”
          </label>
        </div>
      </AppFilterPanel>

      <div class="text-xs opacity-60 mb-2" data-test-characters-count aria-live="polite">
        {{ visibleCharacters.length }} of {{ savedCharacters.length }}
        {{ savedCharacters.length === 1 ? "character" : "characters" }}
      </div>

      <div
        v-if="!visibleCharacters.length"
        class="flex flex-col items-center justify-center text-center py-12 px-4 rounded-lg bg-base-200/60"
        data-test-characters-no-matches>
        <p class="text-base-content/70 mb-3">No characters match these filters.</p>
        <button type="button" class="btn btn-sm" @click="resetFilters">Clear filters</button>
      </div>
      <div
        v-else
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3"
        data-test-characters-grid>
        <CharacterOverviewCard
          v-for="character in visibleCharacters"
          :key="character.key"
          :character="character"
          @open="openDetails" />
      </div>
    </template>

    <CharacterOverviewDetails
      ref="detailsRef"
      :character="selectedCharacter"
      @close="selectedKey = null"
      @open-calculator="openInCalculator"
      @open-optimizer="openInOptimizer"
      @delete="deleteCharacter" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import Nav from "../components/navigation/Nav.vue";
import AppFilterPanel from "../components/AppFilterPanel.vue";
import CharacterOverviewCard from "../components/characters/CharacterOverviewCard.vue";
import CharacterOverviewDetails from "../components/characters/CharacterOverviewDetails.vue";
import {
  allCharactersList,
  characterElementsSetImageMap,
  weaponTypesImageMap,
} from "../characters/characters";
import {
  filterAndSortCharacters,
  listSavedCharacters,
  pickNextActiveCharacter,
  type CharacterSortKey,
} from "../characters/characterOverview";
import { useCharacterStore } from "../stores/character";
import { useSettingsStore } from "../stores/settings";
import { useDocumentTitle } from "../composables/useDocumentTitle";
import { useConfirm } from "../composables/useConfirm";
import { useToast } from "../composables/useToast";

useDocumentTitle("Characters — Tacet Forge", "Every character you've set up, with their build at a glance.");

const router = useRouter();
const characterStore = useCharacterStore();
const { characters } = storeToRefs(characterStore);
const settingsStore = useSettingsStore();
const { confirm } = useConfirm();
const { showToast } = useToast();

const search = ref("");
const filterElement = ref<string | null>(null);
const filterWeapon = ref<string | null>(null);
const sort = ref<CharacterSortKey>("name");

const sortOptions: Array<{ value: CharacterSortKey; label: string }> = [
  { value: "name", label: "Name" },
  { value: "element", label: "Element" },
  { value: "weapon", label: "Weapon type" },
  { value: "level", label: "Level" },
  { value: "sequence", label: "Sequence" },
  { value: "rarity", label: "Rarity" },
];

// Same global preference as the character browser's toggle.
const hideWontBuildCharacters = computed({
  get: () =>
    Boolean((settingsStore.config as { hideWontBuildCharacters?: boolean })?.hideWontBuildCharacters),
  set: (value: boolean) => {
    void settingsStore.addToConfig({ hideWontBuildCharacters: value });
  },
});

const savedCharacters = computed(() =>
  listSavedCharacters(characters.value, allCharactersList),
);
const visibleCharacters = computed(() =>
  filterAndSortCharacters(savedCharacters.value, characters.value ?? {}, {
    search: search.value,
    element: filterElement.value,
    weapon: filterWeapon.value,
    hideWontBuild: hideWontBuildCharacters.value,
    sort: sort.value,
  }),
);

const activeFilterCount = computed(
  () =>
    (search.value.trim() ? 1 : 0) +
    (filterElement.value ? 1 : 0) +
    (filterWeapon.value ? 1 : 0) +
    (hideWontBuildCharacters.value ? 1 : 0),
);

function resetFilters() {
  search.value = "";
  filterElement.value = null;
  filterWeapon.value = null;
  hideWontBuildCharacters.value = false;
}

const detailsRef = ref<InstanceType<typeof CharacterOverviewDetails> | null>(null);
const selectedKey = ref<string | null>(null);
const selectedCharacter = computed(
  () => savedCharacters.value.find((character) => character.key === selectedKey.value) ?? null,
);

async function openDetails(key: string) {
  selectedKey.value = key;
  await nextTick();
  await detailsRef.value?.triggerOpenModal();
}

function openCharacter(key: string, screen?: string) {
  detailsRef.value?.triggerCloseModal();
  characterStore.setActiveCharacter(key);
  void router.push(screen ? { path: "/", query: { screen } } : "/");
}

function openInCalculator(key: string) {
  openCharacter(key);
}

function openInOptimizer(key: string) {
  openCharacter(key, "optimizer");
}

// The details modal is closed first so the confirm dialog isn't stacked under it.
async function deleteCharacter(key: string) {
  const name = savedCharacters.value.find((character) => character.key === key)?.name ?? key;
  detailsRef.value?.triggerCloseModal();
  const confirmed = await confirm(
    `Remove ${name} and all of their builds, buffs and rotations? Their echoes stay in your inventory, just unequipped.`,
    { title: "Remove character", confirmLabel: "Remove", variant: "error" },
  );
  if (!confirmed) return;
  const wasActive = characterStore.activeCharacter === key;
  characterStore.deleteCharacter(key);
  // Otherwise the calculator falls back to its default character and recreates
  // an empty record for them.
  const next = wasActive
    ? pickNextActiveCharacter(savedCharacters.value, characterStore.favoriteCharacters)
    : null;
  if (next) {
    characterStore.setActiveCharacter(next.key);
    showToast(`${name} removed — the calculator now shows ${next.name}`, "success");
    return;
  }
  showToast(`${name} removed`, "success");
}
</script>
