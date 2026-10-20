<template>
  <div
    class="character-avatar relative shrink-0 rounded-full border-2 bg-base-300 overflow-hidden"
    :class="[sizeClass, rarity === 5 ? 'border-amber-300' : 'border-violet-600']">
    <img
      v-if="!failed"
      :src="src"
      :alt="name"
      loading="lazy"
      class="size-full object-cover"
      @error="failed = true" />
    <span
      v-else
      class="size-full flex items-center justify-center font-semibold text-base-content/70"
      role="img"
      :aria-label="name"
      data-test-character-avatar-fallback>
      {{ initials }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { characterPortraitUrl } from "../../characters/characters";

const props = withDefaults(
  defineProps<{ characterKey: string; name: string; rarity: number; sizeClass?: string }>(),
  { sizeClass: "size-12" },
);

const failed = ref(false);
const src = computed(() => characterPortraitUrl(props.characterKey));
const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(""),
);
watch(src, () => {
  failed.value = false;
});
</script>
