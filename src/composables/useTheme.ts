import { useSettingsStore } from "../stores/settings";

/**
 * Tacet Forge ships a single dark theme (tailwind.config.js). Upstream let users
 * pick one of eight; a stored choice is ignored and rewritten to "dark".
 */
export const APP_THEME = "dark";

export type ThemeStyle = "light" | "dark";

/**
 * Sets the theme attributes on <html> (index.html already ships them, this
 * keeps them right if anything changed them) and replaces any other theme left
 * in settings by upstream's theme picker, so code that still reads
 * `config.theme` (e.g. the old "black" tweaks) sees "dark". Call once after
 * Pinia is installed.
 */
export function applyAppTheme() {
  document.documentElement.setAttribute("data-theme", APP_THEME);
  document.documentElement.setAttribute("data-theme-style", "dark");

  const settingsStore = useSettingsStore();
  const config = settingsStore.config as { theme?: unknown } | null;
  if (config && config.theme !== undefined && config.theme !== APP_THEME) {
    settingsStore.addToConfig({ theme: APP_THEME });
  }
}
