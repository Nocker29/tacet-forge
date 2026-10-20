<template>
  <div class="flex flex-wrap gap-2" data-test-optimizer-workspace-echo-sets>
    <button
      v-for="set in sets"
      :key="set"
      type="button"
      class="rounded-lg p-1.5 border-2 transition-opacity"
      :class="
        isSelected(set)
          ? 'border-primary opacity-100'
          : 'border-transparent opacity-40 hover:opacity-70'
      "
      :aria-pressed="isSelected(set)"
      :aria-label="getEchoSetLabelByType(set)"
      :title="getEchoSetLabelByType(set)"
      :data-test-optimizer-workspace-echo-set="set"
      @click="emit('toggle', set)">
      <img :src="getEchoSetIconByType(set)" alt="" class="size-7" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { getEchoSetIconByType, getEchoSetLabelByType } from "../../echoes/stats";

defineOptions({ name: "OptimizerWorkspaceEchoSets" });

const props = defineProps<{
  sets: string[];
  selected: string[];
}>();

const emit = defineEmits<{
  toggle: [set: string];
}>();

function isSelected(set: string) {
  return props.selected.includes(set);
}
</script>
