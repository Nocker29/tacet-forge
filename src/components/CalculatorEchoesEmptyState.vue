<template>
  <div
    class="echoes-empty-state flex flex-col gap-4 rounded-lg border border-dashed border-primary/50 bg-base-100 p-4"
    data-test-echoes-empty-state>
    <div class="flex flex-col gap-1">
      <h4 class="text-sm font-semibold">Set up your echoes</h4>
      <p class="text-xs opacity-70">
        Add echoes from your account, or apply a preset you saved earlier.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-sm btn-primary"
        data-test-echoes-empty-import
        @click="emit('import')">
        Import echoes
      </button>
      <button
        type="button"
        class="btn btn-sm"
        data-test-echoes-empty-inventory
        @click="emit('browse-inventory')">
        Pick from inventory
      </button>
      <button
        v-if="savedPresetCount > 0"
        type="button"
        class="btn btn-sm"
        data-test-echoes-empty-saved-presets
        @click="emit('open-saved-presets')">
        Apply a saved preset
        <span class="badge badge-sm">{{ savedPresetCount }}</span>
      </button>
    </div>
    <div
      v-if="communityPresetCount > 0"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-base-content/10 pt-3 text-xs">
      <span class="opacity-70">
        Or start from a baseline theorycrafter build, useful as a reference or
        for supports and healers.
      </span>
      <button
        type="button"
        class="btn btn-xs btn-ghost"
        data-test-echoes-empty-community
        @click="emit('open-community-builds')">
        Browse {{ communityPresetCount }} theorycrafter
        {{ communityPresetCount === 1 ? "build" : "builds" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  savedPresetCount: number;
  communityPresetCount: number;
}>();

const emit = defineEmits<{
  import: [];
  "browse-inventory": [];
  "open-saved-presets": [];
  "open-community-builds": [];
}>();
</script>
