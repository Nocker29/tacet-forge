<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="alt"
    loading="lazy"
    @error="failed = true" />
  <span
    v-else
    class="inline-flex items-center justify-center bg-base-300 text-base-content/40"
    role="img"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
    data-test-app-image-fallback>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-1/2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <path d="M21 15l-5-5L5 21"></path>
    </svg>
  </span>
</template>

<script setup lang="ts">
// An <img> that degrades to a neutral placeholder when the (hotlinked) image
// is missing or fails to load, so a broken host never shows a broken-image icon.
import { ref, watch } from "vue";

const props = withDefaults(defineProps<{ src?: string | null; alt?: string }>(), {
  src: null,
  alt: "",
});

const failed = ref(false);
watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>
