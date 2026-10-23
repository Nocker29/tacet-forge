// @ts-nocheck
import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { createWebHistory, createRouter } from "vue-router";
import FloatingVue, { vTooltip } from "floating-vue";
import type { DirectiveBinding } from "vue";
import { sanitizeTooltipValue } from "./utils/sanitizeHtml";
import "floating-vue/dist/style.css";
import { createPinia } from "pinia";
import { createPersistedState } from "pinia-plugin-persistedstate";
import { runMigrations } from "./migrations";
import { normalizeForkDataVersion, runForkMigrations } from "./migrations/fork";
import { findStoredDataProblem, renderRecoveryScreen } from "./utils/safeMode";
import { useCharacterStore } from "./stores/character";
import { useInventoryStore } from "./stores/inventory";
import { reportClassicUiSession } from "./composables/useClassicUi";
import { applyAppTheme } from "./composables/useTheme";

import HomeView from "./pages/HomeView.vue";
import OptimizerView from "./pages/OptimizerView.vue";
import UpdatesView from "./pages/UpdatesView.vue";
import InfoView from "./pages/InfoView.vue";
import InfoOverview from "./components/info/InfoOverview.vue";
import InfoCvRv from "./components/info/InfoCvRv.vue";
import InfoTuningOdds from "./components/info/InfoTuningOdds.vue";
import InfoFormulas from "./components/info/InfoFormulas.vue";
import InfoCredits from "./components/info/InfoCredits.vue";
import PrivacyView from "./pages/PrivacyView.vue";
import SettingsView from "./pages/SettingsView.vue";
import LegalView from "./pages/LegalView.vue";
import InventoryView from "./pages/InventoryView.vue";
import ConveneView from "./pages/ConveneView.vue";
import TeamRotationsView from "./pages/TeamRotationsView.vue";
import CharactersView from "./pages/CharactersView.vue";

const routes = [
  { path: "/", component: HomeView, name: "HomeView" },
  // { path: "/calculator", component: HomeView, name: 'HomeView' },
  { path: "/optimizer", component: OptimizerView, name: "OptimizerView" },
  { path: "/updates", component: UpdatesView, name: "UpdatesView" },
  // Children only render when the liveResultBar "UI Overhaul 3.0" flag is
  // on - InfoView.vue renders the full legacy article on every one of
  // these paths when the flag is off (see docs/adr/0024). This is the
  // first nested route in this router.
  {
    path: "/info",
    component: InfoView,
    name: "InfoView",
    children: [
      { path: "", component: InfoOverview, name: "InfoOverview" },
      { path: "cv-echo-rating", component: InfoCvRv, name: "InfoCvRv" },
      { path: "tuning-odds", component: InfoTuningOdds, name: "InfoTuningOdds" },
      { path: "formulas", component: InfoFormulas, name: "InfoFormulas" },
      { path: "credits", component: InfoCredits, name: "InfoCredits" },
    ],
  },
  { path: "/privacy", component: PrivacyView, name: "PrivacyView" },
  { path: "/settings", component: SettingsView, name: "SettingsView" },
  { path: "/legal", component: LegalView, name: "LegalView" },
  { path: "/inventory", component: InventoryView, name: "InventoryView" },
  { path: "/convene", component: ConveneView, name: "ConveneView" },
  { path: "/teams", component: TeamRotationsView, name: "TeamRotationsView" },
  { path: "/characters", component: CharactersView, name: "CharactersView" },
];

const router = createRouter({
  history: createWebHistory("/"),
  routes,
});

// Tacet Forge: corrupted saved data (or a crash while loading it) shows a
// recovery screen instead of a blank page (src/utils/safeMode.ts).
const storedDataProblem = findStoredDataProblem();
if (storedDataProblem) {
  renderRecoveryScreen(storedDataProblem);
} else {
  try {
    startApp();
  } catch (error) {
    console.error(error);
    renderRecoveryScreen(`The app crashed while loading your data (${String(error)}).`);
  }
}

function startApp() {
  console.time("runMigrations");
  // Upgrade persisted localStorage before Pinia hydrates stores from it
  normalizeForkDataVersion();
  runMigrations();
  runForkMigrations();
  console.timeEnd("runMigrations");

  const pinia = createPinia();
  pinia.use(
    createPersistedState({
      auto: true,
    }),
  );

  const app = createApp(App).use(pinia).use(router).use(FloatingVue);
  // Tacet Forge: tooltip HTML may contain values from user data (e.g. an
  // imported backup), so it's sanitized before floating-vue renders it.
  app.directive("tooltip", {
    ...vTooltip,
    beforeMount: (el: HTMLElement, binding: DirectiveBinding, ...rest: unknown[]) =>
      (vTooltip.beforeMount as Function)(el, { ...binding, value: sanitizeTooltipValue(binding.value) }, ...rest),
    updated: (el: HTMLElement, binding: DirectiveBinding, ...rest: unknown[]) =>
      (vTooltip.updated as Function)(el, { ...binding, value: sanitizeTooltipValue(binding.value) }, ...rest),
  });

  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();

  // Count sessions still on the classic UI (ADR 0038). Needs Pinia, so after .use(pinia).
  reportClassicUiSession();

  applyAppTheme();

  // prevent bfcache
  window.addEventListener("unload", () => {
    console.log("unloading app");
  });

  app.mount("#app");
}
