import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_THEME, applyAppTheme } from "../../src/composables/useTheme";
import { useSettingsStore } from "../../src/stores/settings";

describe("applyAppTheme (single dark theme)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-style");
  });

  it("sets the dark theme attributes on <html>", () => {
    applyAppTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-style")).toBe("dark");
  });

  it.each(["light", "black", "synthwave", "pastel", "night", "nord", "dracula", 42, null])(
    "replaces a stored upstream theme (%s) with dark",
    (stored) => {
      const settings = useSettingsStore();
      settings.setConfig({ theme: stored, useClassicUi: true });
      applyAppTheme();
      expect(settings.config).toEqual({ theme: APP_THEME, useClassicUi: true });
    },
  );

  it("doesn't write a theme for a profile that never picked one", () => {
    const settings = useSettingsStore();
    settings.setConfig({ density: "compact" });
    applyAppTheme();
    expect(settings.config).toEqual({ density: "compact" });
  });

  it("copes with a missing config", () => {
    const settings = useSettingsStore();
    settings.setConfig(null as never);
    expect(() => applyAppTheme()).not.toThrow();
  });
});

describe("tailwind.config.js", () => {
  it("ships only the dark DaisyUI theme", () => {
    // CommonJS file in an ESM package, so read it rather than import it.
    const source = readFileSync(resolve(process.cwd(), "tailwind.config.js"), "utf8");
    expect(source.match(/themes:\s*(\[[^\]]*\])/)?.[1]).toBe('["dark"]');
  });
});
