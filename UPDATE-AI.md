# UPDATE-AI.md — updating Tacet Forge from upstream

Self-contained brief for an AI agent with no prior context. Read it top to bottom once;
afterwards the checklists are enough.

## 1. What this is

- **Tacet Forge** = a fork of **Wuthering Tools** (github.com/ryanbenson/wuthering-waves-optimizer),
  a Wuthering Waves damage calculator / echo optimizer. GPL-3.0 (keep `LICENSE`, keep upstream
  credits). Static Vue 3 + TypeScript + Vite app; all math runs in the browser; user data lives in
  the browser's localStorage. No backend.
- Owner: **Mateusz** (GitHub `Nocker29`). Talk to them **in Polish**, briefly, in plain words.
  The app's UI text stays **English**.
- Machine: Windows 11, repo at the project root (this file's folder). Bash (Git Bash) and
  PowerShell available. Node 24 + npm 11, git, GitHub CLI (`gh`, may only be at
  `C:\Program Files\GitHub CLI\gh.exe`).
- How the owner runs it: `start.bat` → `scripts/update.mjs` (see §3) → serves `dist/` on
  **http://localhost:4317** (fixed port: localStorage is per origin).
- More context: `CLAUDE.md` (rules), `CHANGES.md` (every fork change, dated),
  `docs/fork-features.md` (how fork features work), `docs/fork-hosting.md`.

## 2. Rules (non-negotiable)

1. **Never run upstream code before reviewing its diff** (§5 step 3). Tests and the build execute
   repository code; an unreviewed merge could run anything on the owner's PC.
2. **Never push to `master` directly.** Branch → PR to `master` on `Nocker29/tacet-forge` →
   merge. The owner has approved commits, pushes, PRs and merges on *our* repo.
3. **Never push or open PRs to upstream** (`upstream` push URL is `DISABLED`).
4. **No public deployment/hosting** without the owner's explicit OK in that conversation.
5. Small PRs, tests and build green, a dated `CHANGES.md` entry for every user-visible change.
6. Don't rewrite `src/calculator/`, `packages/formulas/`, `src/characters/` — take upstream's.

## 3. Remotes, branches and the automatic updater

| Remote | Repository | Use |
|---|---|---|
| `origin` | github.com/Nocker29/tacet-forge | ours; default branch `master` |
| `upstream` | github.com/ryanbenson/wuthering-waves-optimizer | fetch only |

`start.bat` runs `scripts/update.mjs` on every launch (only on local `master`):
- **origin ahead** → asks "Zainstalować aktualizację? [T/N]"; on T: fast-forward only,
  `npm ci --ignore-scripts` if the lockfile changed, `npx vitest run`, `npm run build`; on any
  failure it resets to the previous commit and restores the old `dist/`. Log:
  `logs/update-last.log`. It never pushes.
- **upstream ahead** → only prints the new commit titles and "ask Claude". It never merges or
  runs upstream code. **That's where you come in** (§5).
- It refuses (and changes nothing) when tracked files are modified or local `master` has commits
  that aren't on `origin`.

So: the owner gets upstream changes only after you merge them into `origin/master` via a PR;
their next `start.bat` then offers that update.

## 4. Environment gotchas

- Run git pushes with `GCM_INTERACTIVE=always` (Git Credential Manager may need a browser login).
- `gh` not on PATH in old shells: use the full path above.
- If `node -v` shows 22, PATH has a bundled Node first; prepend `C:\Program Files\nodejs`.
- `npm run test` is watch mode; use `npx vitest run`.
- Set `CYPRESS_INSTALL_BINARY=0` for `npm ci` (no Cypress download needed).

## 5. Procedure: merge upstream

```bash
# 0. clean start
git status                      # tracked files must be clean
git switch master && git pull --ff-only origin master
git fetch upstream master
git log --oneline master..upstream/master        # what's new
git diff --stat master...upstream/master         # which files

# 1. branch + merge (merging doesn't execute anything)
git switch -c chore/merge-upstream-$(date +%F)
git merge --no-ff --no-commit upstream/master
```

**3. Review the incoming diff BEFORE running npm/tests/build** —
`git diff master...upstream/master -- <path>` for each item:

- [ ] `package.json` / `package-lock.json`: new or changed dependencies (name typos, unknown
      publishers, git/URL deps), new `scripts`, `preinstall`/`postinstall`/`prepare` hooks.
- [ ] `scripts/`, `cli/`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `.github/`,
      `start.bat`, `Makefile`, anything under `packages/*/` build config.
- [ ] Any `child_process`, `exec`, `eval`, `new Function`, `fs` writes outside the repo, `fetch`
      or other network calls in build/test code, base64/minified/obfuscated blobs, new external
      URLs (other than game-image hosts already used: `api.encore.moe`, `api-v2.encore.moe`,
      `ryanbenson.github.io/wuthering-waves-assets`, `static.nanoka.cc`).
- [ ] Analytics, ads, payment/donation links or upstream Discord links being added.
- Typical safe content: `src/characters/<Name>/`, `src/weapons/`, `src/echoes/`, `src/buffs/`,
  `src/content/updates.ts`, `src/characters/characters.ts`, component fixes, tests, docs.

If anything matches the red flags in §8 → stop, `git merge --abort`, report to the owner.

```bash
# 4. resolve conflicts (§6), then
git commit --no-edit
CYPRESS_INSTALL_BINARY=0 npm ci --ignore-scripts   # only if package-lock.json changed
npx vitest run                                      # must be all green
npm run build                                       # must pass without SCANNER_DATA_SIGNING_KEY
```

5. Check new content: `tests/fork/newContentCoverage.test.ts` runs every character and echo set
   through the fork's features (it's part of `vitest run`). Optionally verify in the browser (§7).
6. Add a dated `CHANGES.md` entry: "Merged Wuthering Tools up to `<sha>`: <what came in>; <what
   you adapted>".
7. Push the branch, open a PR to `master` (summary of upstream changes, review notes, test
   results), merge it, then `git switch master && git pull --ff-only` and `npm run build`.
8. Tell the owner (Polish, 2–4 sentences): what came in (new characters/weapons/sets), anything
   adapted, and "uruchom start.bat / odśwież http://localhost:4317 (Ctrl+F5)".

## 6. Where the fork differs (conflicts happen here)

Upstream base: `4d8d068`. For a file's fork changes: `git log --oneline 4d8d068..master -- <file>`.

| Area | Files | Keep from the fork |
|---|---|---|
| Branding, legal (GPL §5a) | `README.md`, `index.html`, `package.json` (name, homepage, bugs, `serve:dist`, `package:offline`), `src/utils/forkInfo.ts`, `src/components/info/*`, `src/pages/{Info,Legal,Privacy}View.vue`, `public/robots.txt` | Tacet Forge name, fork links, "based on Wuthering Tools" credit + original credits |
| `public/sitemap.xml` | deleted in the fork | modify/delete conflict on most releases → `git rm public/sitemap.xml` |
| No analytics | `src/utils/analytics.ts` (no-op `trackEvent`), no Umami script, no `vercel.json` proxy, no upstream Discord links | keep removed; new upstream tracking calls just hit the no-op |
| Wavescan / OCR scanner off | `src/utils/forkFeatures.ts`, scanner bits in `Settings*.vue`, `CalculatorEchoParser.vue`, `InventoryEchoesBrowser.vue`, `vite-env.d.ts`, Vite plugin | switch stays off, code stays; build works without the signing key |
| F1 dark theme only | `tailwind.config.js`, `ThemeChooser.vue`, `useTheme.ts`, `SettingsPreferences.vue` | one DaisyUI `dark` theme |
| F2 Characters page | `src/pages/CharactersView.vue`, `src/components/characters/*`, `src/characters/characterOverview.ts`, `src/composables/useCharacterOverview.ts`, `src/utils/calculatorScreen.ts`, `Nav.vue`, route in `main.ts` | page, Remove character, calculator switches to a favorite/first character when its own is removed |
| F3 Protected characters | `src/echoes/optimizerProtection.ts`, `OptimizerProtectedCharacters.vue`, `OptimizerLoadoutDonors.vue`, `Calculator.vue` (`handleOptimize`), `CalculatorOptimizer*.vue`, `optimizerWorkspace/*`, `stores/inventory.js` | replaces upstream's "Ignore echoes equipped by other resonators"; grid only lists characters holding echoes in the eligible sets |
| F4 set filter | `OptimizerSetFilterControls.vue`, `OptimizerWorkspaceEchoSets.vue`, `CalculatorOptimizer.vue` | Select all / Clear + "N/M sets" counter |
| UI tweaks | `CalculatorCharacterBuffs.vue`, `WorkspaceBuffs.vue` (bulk buttons in their own row), `CalculatorWeapons.vue`, `WorkspaceWeaponPanel.vue` (buttons right after the heading) | layout only |
| Duplicates | `src/echoes/duplicateCleanup.ts`, `InventoryEchoesBrowser.vue` (Remove duplicates), `useDuplicateImportPrompt.ts`, `useEchoDuplicateReview.ts`, `useConfirm.ts` + `ConfirmDialog.vue` (`choose()`) | import asks Skip / Import anyway (/ Review) |
| Settings data tools | `SettingsDelete.vue` (Delete all echoes → `clearAllEchoes`, `src/echoes/clearEchoes.ts`), `SettingsBackupRestore.vue` + `SettingsImport.vue` (Choose JSON file…, `src/utils/jsonFile.ts`), `src/utils/settingsBackup.ts` | |
| Store actions | `stores/character.js` (`deleteCharacter`), `stores/inventory.js` (protection getters/actions) | additive: keep ours and upstream's |
| Data / migrations | `src/migrations/index.ts`, `src/migrations/fork.ts`, `src/migrations/fork/*`, `main.ts`, `settingsBackup.ts` | see "Migrations" below |
| Local running / updater | `start.bat`, `scripts/{serve-dist,update,pack-offline}.mjs`, `.gitattributes`, `.gitignore`, this file | fork-only, fixed port 4317 |

Conflict recipes:
- **Component both sides changed** (`Calculator.vue`, `CalculatorOptimizer.vue`, `OptimizerWorkspaceSetup.vue`, …):
  take upstream's version, then re-apply the fork's change (`git log -p 4d8d068..master -- <file>`).
- **`package.json` / lockfile**: take upstream's dependency changes, keep our name/homepage/bugs/scripts;
  regenerate with `npm install --ignore-scripts` if needed; re-check §5 step 3 for the result.
- **Upstream changes the "Ignore echoes equipped…" toggle**: port the behaviour into `optimizerProtection.ts`.
- **New analytics / Discord / scanner UI**: disable it the same way as the existing ones.

**Migrations.** `src/migrations/index.ts` + `versions/` are **upstream's** timeline — take
upstream's new migrations unchanged (numbers, `CURRENT_DATA_VERSION`). Fork migrations live in
`src/migrations/fork/` (key `tacetForgeDataVersion`); never add fork ones to `versions/`. A
historical fork stamp of data version 10 is handled by `normalizeForkDataVersion` /
`normalizeImportedDataVersion`, so upstream's own v10 can be merged as-is.
`tests/utils/forkBackupCompat.test.ts` must stay green.

## 7. Verify in the browser (optional but recommended)

`npm run dev` → http://localhost:5173 (a separate profile from the owner's 4317 data):
calculator → pick the new character; `/characters` lists it once opened; Optimizer → eligible
echo sets shows any new set and the counter total grows; Inventory → Echoes still loads;
Settings → Backup & Restore exports. Check a phone width too (no horizontal scroll).

## 8. Red flags — stop and ask the owner

- Any §5 step-3 item you can't explain from the commit messages/release notes.
- Upstream history rewritten (`git merge-base master upstream/master` no longer contains the
  previous merge), a new upstream owner/URL, or unsigned huge binary blobs.
- Tests that only pass after weakening/deleting them, or a build that needs new secrets.
- A conflict that would remove a fork feature or the GPL credits.
- Anything that would touch hosting, the owner's data in localStorage, or upstream's repo.

Report what you found and what you suggest; don't merge.
