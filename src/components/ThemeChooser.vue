<template>
  <div title="Display options" class="dropdown dropdown-end block">
    <div
      tabindex="0"
      role="button"
      class="btn group btn-ghost btn-square"
      aria-label="Display options">
      <div
        class="bg-base-100 group-hover:border-base-content/20 border-base-content/10 grid size-6 shrink-0 grid-cols-[repeat(2,auto)] place-content-center gap-1 rounded-md border transition-colors">
        <div class="bg-base-content size-1.5 rounded-full"></div>
        <div class="bg-primary size-1.5 rounded-full"></div>
        <div class="bg-secondary size-1.5 rounded-full"></div>
        <div class="bg-accent size-1.5 rounded-full"></div>
      </div>
    </div>
    <div
      tabindex="0"
      class="dropdown-content bg-base-200 text-base-content rounded-box top-px max-h-[calc(100vh-8.6rem)] overflow-y-auto border border-white/5 shadow-2xl outline-1 outline-black/5 mt-16">
      <ul class="menu w-56">
        <li class="menu-title text-xs">Density</li>
        <li v-for="option in densityOptions" :key="option.value">
          <button
            type="button"
            class="gap-3 px-2"
            :data-set-density="option.value"
            @click="chooseDensity(option.value)">
            <div class="w-32 truncate capitalize">{{ option.label }}</div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="h-3 w-3 shrink-0 ml-auto"
              :class="density === option.value ? 'opacity-100' : 'opacity-0'">
              <path
                d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"></path>
            </svg>
          </button>
        </li>
        <li class="menu-title text-xs mt-2">Interface</li>
        <li v-for="option in uiOptions" :key="option.label">
          <button
            type="button"
            class="gap-3 px-2"
            :data-set-ui="option.classic ? 'classic' : 'v3'"
            @click="setClassicUi(option.classic, 'theme-menu')">
            <div class="w-32 truncate">{{ option.label }}</div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="h-3 w-3 shrink-0 ml-auto"
              :class="isClassicUi === option.classic ? 'opacity-100' : 'opacity-0'">
              <path
                d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"></path>
            </svg>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useUiDensity, type UiDensity } from "../composables/useUiDensity";
import { useClassicUi } from "../composables/useClassicUi";

// Tacet Forge has one dark theme (useTheme.ts), so this menu only holds the
// other display options. The component name is kept for its many call sites.
defineOptions({ name: "ThemeChooser" });

const { density, setDensity, initDensity } = useUiDensity();

const densityOptions: Array<{ value: UiDensity; label: string }> = [
  { value: "comfy", label: "Comfy" },
  { value: "compact", label: "Compact" },
];

// v3 is the default; classic is an opt-in until it's retired (ADR 0038).
const { isClassicUi, setClassicUi } = useClassicUi();
const uiOptions = [
  { classic: false, label: "v3 (default)" },
  { classic: true, label: "Classic" },
];

function chooseDensity(next: UiDensity) {
  setDensity(next);
}

onMounted(() => {
  initDensity();
});
</script>
