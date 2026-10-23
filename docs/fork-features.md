# Tacet Forge: fork features

Features added in the fork, where they live and the rules they follow. User-facing
history is in [CHANGES.md](../CHANGES.md).

## Characters page (`/characters`)

- Page: `src/pages/CharactersView.vue`; cards `src/components/characters/CharacterOverviewCard.vue`;
  read-only details modal `CharacterOverviewDetails.vue`.
- Pure logic (tested): `src/characters/characterOverview.ts` — which characters are listed
  (`listSavedCharacters`: roster characters with a record in the character store), sequence
  from the `SequenceNode<N>…` chain keys, active sets (same threshold rule as the build card),
  filtering and sorting.
- Stats: `src/composables/useCharacterOverview.ts` calls `buildCharacterCalculationContext`
  with `alwaysEnabledOnly` (the build card's rules), one character at a time through a shared
  queue so 40+ cards don't load every module at once. Nothing is copied into a store.
- "Open in calculator" sets the active character and goes to `/`; "Open in optimizer" adds
  `?screen=optimizer`, read once by `Calculator.vue` via `src/utils/calculatorScreen.ts`.
- "Remove character" (details modal → confirm) calls the character store's `deleteCharacter`:
  drops the record and favorite, clears `activeCharacter` if it was them, unequips their echoes
  (`equipped`), unassigns their preset (`equippedPresets`) and removes them from the optimizer
  donors. No store shape change. If the removed character was the calculator's active one,
  `CharactersView` switches it to `pickNextActiveCharacter` (first saved favorite, else first by
  name), because the calculator creates an empty record for whichever character it opens. Only
  when nobody is left does it fall back to its default (the newest five-star).
- Missing images fall back to initials (`CharacterAvatar.vue`) or a neutral placeholder
  (`src/components/AppImage.vue`).

## Protected characters (optimizer)

- Logic (pure, tested): `src/echoes/optimizerProtection.ts`. Holders of an echo = the
  inventory `equipped` map + echoes of the preset assigned in `equippedPresets`. Only
  **donors** are stored (`inventory.optimizerProtection = { donors }`), so anyone not listed
  — including characters who get echoes later — is protected. An echo is excluded if any
  holder is protected, unless the optimized character holds it too (it's already theirs).
- Store: `src/stores/inventory.js` getters `echoHolders`, `optimizerDonors` (`[]` — everyone
  protected — until set; the legacy toggle is read only when seeding, never at runtime, because
  the optimizer UIs still write it), `protectionCandidates`, `protectedEchoIds`; actions
  `setOptimizerDonors`, `ensureOptimizerProtection`.
- Filter: `Calculator.vue` `handleOptimize` drops `protectedEchoIds(character)`; the old
  `ignoreOtherResonantorEchoes` argument/per-character field is kept for compatibility but no
  longer read there. Empty runs caused by protection report `"all-protected"`.
- UI: `OptimizerProtectedCharacters.vue` (in `CalculatorOptimizerSettings.vue`, both UIs),
  the run-bar chip in `OptimizerWorkspaceRunBar.vue`, and `OptimizerLoadoutDonors.vue` on
  result loadouts.
  The grid takes the optimizer's `setFilters` and lists only candidates holding at least one
  usable echo in those sets (`countHeldEchoes`; all sets when empty). Hidden characters keep
  their stored state; the bulk buttons only change the listed ones.
- Data: migration `010_addOptimizerProtection` seeds the field from localStorage (needs both
  stores, so no per-store transform); `applyImportedDatabase` calls
  `ensureOptimizerProtection()` for imported backups. Tests: `tests/echoes/optimizerProtection.test.ts`,
  `tests/utils/forkBackupCompat.test.ts`.

## Echo-set filter: Select all / Clear

- `src/components/OptimizerSetFilterControls.vue` ("N/M sets", Select all, Clear), used by
  `CalculatorOptimizer.vue` (classic) and `OptimizerWorkspaceSetup.vue` (v3).
- Semantics are unchanged: both UIs require at least one set; `Calculator.vue` still treats an
  empty list as "all sets" (`filterEchoesBySets`) but the UI never sends one.
- `syncOptimizerConfig` in both components now writes `echoSets`/`mainEchoes`/`minStats`
  outright after the merge, because `setCharacterData`'s lodash merge can't shorten arrays.
- No pre-run combination estimate: the count is only known inside the generator workers, and
  "Select all" can't make the search larger than picking every set by hand. The run-bar chip
  shows how many echoes the chosen sets leave.

## Duplicate echoes

- Logic (pure, tested): `src/echoes/duplicateCleanup.ts` — `planDuplicateRemoval` (groups by
  `getEchoIdentityKey`, the same key as Find duplicates; keeps held/locked copies, else a
  favorite, else the oldest) and `findIncomingDuplicates` (inventory + repeats in the batch).
- UI: "Remove duplicates" in `InventoryEchoesBrowser.vue` deletes through `removeEchoesFully`
  (clears character slots of deleted echoes; held copies are never in the plan).
- Import question: `useDuplicateImportPrompt` (built on the new `useConfirm().choose`, a
  multi-button `ConfirmDialog`). Used by `importEchoesFromRaw` callers (`SettingsImport.vue`,
  `SettingsBackupRestore.vue`) and `useEchoDuplicateReview` (image importer / scanner, adds
  Review…; cancelling there opens the review list). `applyImportedDatabase` replaces all data
  and doesn't ask.

## Settings: delete all echoes, load import file

- "Delete all echoes" (`SettingsDelete.vue`) → `clearAllEchoes()` in `src/utils/settingsBackup.ts`:
  empties `inventory.echoes`/`equipped`/`echoPresets`/`equippedPresets` (function-form `$patch`,
  object form would merge) and runs `clearEchoesFromCharacters` (`src/echoes/clearEchoes.ts`),
  which resets echo slots and `echoPresetId` on each record and each saved build. Test checks no
  echo/preset id remains anywhere.
- "Choose JSON file…" next to the Import echoes box (`SettingsBackupRestore.vue`,
  `SettingsImport.vue`) uses `readJsonFile` (`src/utils/jsonFile.ts`: FileReader, 20 MB cap,
  JSON check) and fills the box; the full-backup import already had its own file input.

