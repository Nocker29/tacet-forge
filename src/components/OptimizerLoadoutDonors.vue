<template>
  <div
    v-if="donors.length"
    class="flex items-center gap-2 flex-wrap text-xs"
    data-test-optimizer-loadout-donors>
    <span class="opacity-70">Takes echoes from:</span>
    <span
      v-for="donor in donors"
      :key="donor.key"
      class="inline-flex items-center gap-1 rounded-full bg-base-300 pl-0.5 pr-2 py-0.5 max-w-full"
      :data-test-optimizer-loadout-donor="donor.key">
      <CharacterAvatar
        :character-key="donor.key"
        :name="donor.name"
        :rarity="donor.rarity"
        size-class="size-5" />
      <span class="truncate">{{ donor.name }}</span>
      <span class="opacity-60">×{{ donor.count }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
// Lists the other characters (donors) whose echoes a result loadout uses, so
// equipping it doesn't silently strip someone (protected characters).
import { computed } from "vue";
import { useInventoryStore } from "../stores/inventory";
import { allCharactersList, getCharacterRosterDisplayName } from "../characters/characters";
import { getLoadoutDonors } from "../echoes/optimizerProtection";
import CharacterAvatar from "./characters/CharacterAvatar.vue";

const props = defineProps<{ character: string; loadout: unknown[] }>();

const inventoryStore = useInventoryStore();
const rosterByKey = new Map(allCharactersList.map((entry) => [entry.key, entry]));

const donors = computed(() =>
  getLoadoutDonors(
    (props.loadout as Array<{ echoId?: string | null }>).map((echo) => echo?.echoId),
    inventoryStore.echoHolders,
    props.character,
  ).map(({ character, count }) => ({
    key: character,
    count,
    name: getCharacterRosterDisplayName(character),
    rarity: rosterByKey.get(character)?.rarity ?? 4,
  })),
);
</script>
