<template>
  <div class="flex items-center justify-between gap-2 flex-wrap" data-test-optimizer-set-controls>
    <span
      class="text-xs"
      :class="selectedCount ? 'opacity-70' : 'text-warning'"
      aria-live="polite"
      data-test-optimizer-set-count>
      <template v-if="selectedCount">{{ selectedCount }}/{{ totalCount }} sets</template>
      <template v-else>0/{{ totalCount }} sets — pick at least one</template>
    </span>
    <div class="join">
      <button
        type="button"
        class="btn btn-xs join-item"
        :disabled="selectedCount === totalCount"
        data-test-optimizer-set-select-all
        @click="emit('select-all')">
        Select all
      </button>
      <button
        type="button"
        class="btn btn-xs join-item"
        :disabled="selectedCount === 0"
        data-test-optimizer-set-clear
        @click="emit('clear')">
        Clear
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// "N/M sets" counter plus Select all / Clear for the optimizer's echo-set
// filter (classic and v3 setup). Both UIs require at least one set to run.
defineOptions({ name: "OptimizerSetFilterControls" });

defineProps<{ selectedCount: number; totalCount: number }>();

const emit = defineEmits<{ "select-all": []; clear: [] }>();
</script>
