# Updating Tacet Forge (instructions for an AI assistant)

Tacet Forge is a fork of [Wuthering Tools](https://github.com/ryanbenson/wuthering-waves-optimizer).
New characters, weapons, echoes and fixes arrive upstream; this file explains how to bring
them in without losing the fork's changes. The owner reads Polish; reply to them in Polish.

Normally `start.bat` does this itself (`scripts/update.mjs`): it fetches both remotes, asks
"Zainstalować aktualizację? [T/N]", merges, runs `npm ci` (only if the lockfile changed), the
unit tests and the build, then pushes `master`. If anything fails it rolls back to the
previous commit and dist, and tells the owner to ask you. Read `logs/update-last.log` first —
it has the failing step's output.

## Remotes and branches

| Remote | Repository | Use |
|---|---|---|
| `origin` | github.com/Nocker29/tacet-forge | ours; push here. Default branch `master` |
| `upstream` | github.com/ryanbenson/wuthering-waves-optimizer | fetch only (push URL is `DISABLED`). Never push or open PRs upstream |

Work on `master` locally (the updater only runs there). Feature work: a branch from
`master` → PR to `master` on `Nocker29/tacet-forge` → merge → fast-forward local `master`.
The owner has approved commits, pushes, PRs and merges on our repo. Public hosting/deploys
still need their explicit OK.

## Manual update procedure

1. `git status` must be clean (untracked files are fine). `git switch master && git pull --ff-only origin master`.
2. `git fetch upstream master` and look at what's new: `git log --oneline HEAD..upstream/master`.
3. `git switch -c chore/merge-upstream-<date>` then `git merge upstream/master`.
4. Resolve conflicts (see below). Keep both sides' intent; never drop a fork feature to make a merge pass.
5. `npm ci` if `package-lock.json` changed (`CYPRESS_INSTALL_BINARY=0` avoids the Cypress download).
6. `npx vitest run` and `npm run build` — both must pass. The build must not need `SCANNER_DATA_SIGNING_KEY`.
7. Check new content in the running app (`npm run dev`): a new character appears in the
   calculator, on the Characters page (`/characters`) and in the optimizer's Protected
   characters grid once someone holds echoes; a new echo set appears in both optimizer set
   filters and the "N/M sets" counter grows. `tests/fork/newContentCoverage.test.ts` covers the
   data side automatically.
8. Add a dated `CHANGES.md` entry ("Merged upstream up to `<sha>`: …" plus anything you adapted).
9. Commit, push the branch, open a PR to `master`, merge it, then `git switch master && git pull --ff-only`.
10. `npm run build` so `start.bat` serves the new `dist/`. Tell the owner to refresh (Ctrl+F5) on http://localhost:4317.

## Where the fork differs (expect conflicts here)

The full list with dates is in `CHANGES.md`; architecture notes in `docs/fork-features.md`
and `docs/fork-hosting.md`. Files upstream also edits, and what to keep:

| Area | Files | Keep from the fork |
|---|---|---|
| Branding, legal (GPL §5a) | `README.md`, `index.html`, `package.json` (name/homepage/bugs, `serve:dist`, `package:offline`), `src/utils/forkInfo.ts`, `src/components/info/*`, `src/pages/{Info,Legal,Privacy}View.vue`, `public/robots.txt` (no `sitemap.xml`) | Tacet Forge name, fork links, "based on Wuthering Tools" credits, original credits kept, `LICENSE` untouched |
| No analytics | `src/utils/analytics.ts` (no-op `trackEvent`), no Umami script, no `vercel.json` proxy, no upstream Discord links | stay removed; if upstream adds new tracking calls they just hit the no-op |
| Wavescan / OCR scanner off | `src/utils/forkFeatures.ts`, scanner bits in `Settings*.vue`, `CalculatorEchoParser.vue`, `InventoryEchoesBrowser.vue`, `vite-env.d.ts`, build plugin | keep the switch off and the code present; the build must pass without the signing key |
| F1 dark theme only | `tailwind.config.js`, `ThemeChooser.vue`, `useTheme.ts`, `SettingsPreferences.vue` | single DaisyUI `dark` theme |
| F2 Characters page | `src/pages/CharactersView.vue`, `src/components/characters/*`, `src/characters/characterOverview.ts`, `useCharacterOverview.ts`, `calculatorScreen.ts`, `Nav.vue`, route in `main.ts` | page, Remove character (+ auto-switch of the calculator's character) |
| F3 Protected characters | `src/echoes/optimizerProtection.ts`, `OptimizerProtectedCharacters.vue`, `OptimizerLoadoutDonors.vue`, `Calculator.vue` (`handleOptimize` filter), `CalculatorOptimizer*.vue`, `OptimizerWorkspace*.vue`, `stores/inventory.js` | replaces upstream's "Ignore echoes equipped by other resonators"; the grid follows the eligible set filter |
| F4 set filter Select all / Clear | `OptimizerSetFilterControls.vue`, `OptimizerWorkspaceEchoSets.vue`, `CalculatorOptimizer.vue` | counter and buttons |
| UI tweaks | `CalculatorCharacterBuffs.vue`, `WorkspaceBuffs.vue` (bulk buttons in their own row), `CalculatorWeapons.vue`, `WorkspaceWeaponPanel.vue` (buttons right after the heading) | layout only |
| Store actions | `stores/character.js` (`deleteCharacter`), `stores/inventory.js` (protection getters/actions) | additive; merge with upstream's new actions |
| Data/migrations | `src/migrations/index.ts`, `src/migrations/fork.ts`, `src/migrations/fork/*`, `src/utils/settingsBackup.ts`, `main.ts` | see next section |
| Local running | `start.bat`, `scripts/{serve-dist,update,pack-offline}.mjs`, `.gitattributes`, `.gitignore` | fixed port 4317 (localStorage is per origin) |

Typical conflicts:
- **`public/sitemap.xml` modify/delete** (upstream refreshes it with every release note): keep it
  deleted — `git rm public/sitemap.xml`. It points at upstream's domain. The updater can't
  resolve this on its own, so expect most upstream releases to need a manual merge.
- **Upstream edits a component we also changed** (`Calculator.vue`, `CalculatorOptimizer.vue`,
  `OptimizerWorkspaceSetup.vue`): take upstream's version, then re-apply our hunk (`git diff 4d8d068 HEAD -- <file>` on the pre-merge master shows it).
- **`package.json` / `package-lock.json`**: take upstream's dependency changes, keep our name/homepage/bugs/scripts; regenerate the lockfile with `npm install` if needed, then `npm ci`.
- **New upstream analytics/Discord/scanner UI**: keep it disabled the same way as the existing ones.
- **Upstream changes the "Ignore echoes equipped…" toggle**: the toggle is replaced by protected characters; port any behaviour change into `optimizerProtection.ts` instead.

## Migration numbering rule

- `src/migrations/index.ts` is **upstream's** timeline. Take upstream's new migrations
  unchanged (same numbers, same `CURRENT_DATA_VERSION`). Never add fork migrations there.
- Fork migrations live in `src/migrations/fork/` with their own key `tacetForgeDataVersion`
  (`CURRENT_FORK_DATA_VERSION` in `src/migrations/fork.ts`). Add new ones there, idempotent, with a test.
- Historical wrinkle: fork migration 1 first shipped as upstream-track version 10.
  `normalizeForkDataVersion` / `normalizeImportedDataVersion` handle that, so when upstream
  ships its own version 10 just merge it. After merging, run `tests/utils/forkBackupCompat.test.ts`
  — it checks old upstream backups, old fork profiles/backups and new exports.
- Every persisted-shape change still needs a test that an old wutheringtools.com backup loads.

## Checks before you report back

- `npx vitest run` green, `npm run build` green.
- `CHANGES.md` entry, docs updated if behaviour changed (`docs/fork-features.md`).
- PR merged into `master`, local `master` = `origin/master`, `dist/` rebuilt.
- Tell the owner in Polish, briefly: what came in (new characters/sets), anything you had to adapt, and to refresh the page.
