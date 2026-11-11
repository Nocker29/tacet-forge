<template>
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
    <template v-if="showInterface">
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
    </template>
  </ul>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useUiDensity, type UiDensity } from "../composables/useUiDensity";
import { useClassicUi } from "../composables/useClassicUi";

// The density and interface lists (Tacet Forge ships one dark theme, so no
// theme list), shared by ThemeChooser.vue's
// dropdown and the phone More menu (NavUtilityMenu.vue). Mounting it applies
// the saved density, so every layout renders one, opened or not.
defineOptions({ name: "ThemeOptions" });

// The v3 More menu has its own "Switch to classic UI" item.
withDefaults(defineProps<{ showInterface?: boolean }>(), { showInterface: true });

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
