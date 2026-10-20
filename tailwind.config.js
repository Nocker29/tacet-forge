// tailwind.config.js

module.exports = {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Routed through CSS vars so the v3 UI can enlarge them (style.css,
      // html[data-ui="v3"]); the fallbacks are Tailwind's defaults, which classic keeps.
      fontSize: {
        xs: ["var(--text-xs, 0.75rem)", { lineHeight: "var(--text-xs-lh, 1rem)" }],
        sm: ["var(--text-sm, 0.875rem)", { lineHeight: "var(--text-sm-lh, 1.25rem)" }],
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("daisyui")],
  // Tacet Forge: one dark theme only (see src/composables/useTheme.ts).
  daisyui: {
    themes: ["dark"],
  },
};
