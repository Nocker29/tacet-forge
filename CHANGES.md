# Changes in Tacet Forge

Tacet Forge is a modified version of [Wuthering Tools](https://github.com/ryanbenson/wuthering-waves-optimizer)
by @LavaSnake and contributors, forked from upstream commit `4d8d068` (2026-10-19).
It is distributed under the same license, the GNU GPL v3 or later (see [LICENSE](./LICENSE)).
This file lists the changes made in the fork, as required by GPL-3.0 §5(a).

## 2026-10-21

- Renamed the app to Tacet Forge (page titles, Info, Legal); export/backup file
  format identifiers are unchanged so existing Wuthering Tools backups still load.
- Credits: added a "based on Wuthering Tools" notice with links to the original and
  to this fork's source. Original credits are kept.
- Removed Umami analytics (script injector and the `vercel.json` proxy rewrites);
  the Privacy page now says the app has no analytics.
- Replaced the upstream Discord links with this fork's GitHub repository/issues.
- Removed `public/sitemap.xml` and the sitemap line in `robots.txt` (they pointed
  at the upstream domain).
- Disabled the screen-share/video echo scanner, the Wavescan settings section and the
  published `scanner-data.json`/`scanner-assets.json` (switch: `src/utils/forkFeatures.ts`).
  The production build no longer needs `SCANNER_DATA_SIGNING_KEY`. The scanner code is kept.
- Added `start.bat` and `scripts/serve-dist.mjs` to run the built app locally on
  http://localhost:4317, and `docs/fork-hosting.md` (hosting options, image hotlink vs mirror).
- **F1 – dark theme only.** DaisyUI ships just the `dark` theme; the theme list was
  removed from the top-bar menu (now "Display options": density + classic/v3 UI).
  A theme saved by upstream's picker (light, black, synthwave…) is rewritten to `dark`
  on load (`applyAppTheme`, `src/composables/useTheme.ts`).
- **F2 – Characters page** (`/characters`, grid icon in the top bar; in the "…" menu on
  phones). A card for every character with a saved record: avatar, level, sequence,
  status, weapon, active echo sets, ATK/HP/Crit/ER/DEF and Build Score. Search, element
  and weapon filters, sort (name, element, weapon type, level, sequence, rarity) and the
  shared "Hide Won't build" toggle. Clicking a card opens a read-only view (weapon, 5
  echoes with main/substats, full stats, sets) with "Open in calculator" / "Open in
  optimizer" (`/?screen=optimizer`). Stats use the build card's rules (equipment +
  permanent bonuses). Reads the existing stores only; no new persisted data.
- Build card image watermark now reads "TACET FORGE" instead of the upstream domain.
- **F3 – Protected characters** replace "Ignore echoes equipped by other resonators" in
  the optimizer's advanced settings. An avatar grid of every other character that has
  echoes equipped or a preset assigned: protected (lock, echoes excluded) or donor
  (dimmed, echoes usable), with Protect all / Unlock all / Invert. Everyone is protected by
  default, including characters that get echoes later. An echo shared by several
  characters is excluded if any of them is protected. A summary shows how many echoes are
  available/excluded and by whom (also as a chip next to Run Optimizer), results show
  which characters a loadout takes echoes from, and an empty run explains when protection
  removed every matching echo. Stored once in `inventory.optimizerProtection`, so it's in
  the JSON backup. Data version 10: migration seeds it from the old toggle (on anywhere →
  all protected; explicitly off → all donors; never set → all protected); importing an
  older backup does the same.
- Fix: importing a backup now restores which character uses which echo preset
  (`equippedPresets` was dropped by the inventory import).
- **F4 – Select all echo sets.** The optimizer's set filter (classic and v3) gets a
  "N/M sets" counter with Select all and Clear; set buttons now have their set name as
  label/tooltip and expose their on/off state to screen readers. Both UIs still require at
  least one set (the counter says so when none is picked); the run-bar chip from F3 shows
  how many echoes the chosen sets leave.
- Fix: removing an echo set, main echo or stat floor in the optimizer setup now always
  saves (lodash `merge` never shortened the stored lists).
- Added `npm run package:offline` (sources + prebuilt `dist/` in one zip) and
  `npm run serve:dist`.
- **Remove a character** from the Characters page: "Remove character" in its details
  (with a confirmation) deletes the saved record with all builds, buffs and rotations.
  Its echoes stay in the inventory, just unequipped; its preset is unassigned, not deleted.
  Removing the character open in the calculator switches the calculator to your first
  favorite still saved, else the first remaining character by name.
- Character Buffs: Enable all / Max all / Disable all moved to their own row under the
  heading, above Stat Bonuses (v3 and classic).
- Weapon: the header buttons (Enable all / Max all / Browse / Equip signature) sit right after
  the heading instead of at the far right (v3 and classic).

## 2026-10-22

- **Updates on launch.** `start.bat` runs `scripts/update.mjs`: it checks this fork and Wuthering
  Tools on GitHub (skipped when offline), lists what's new and asks before installing. Installing
  merges both, reinstalls dependencies if needed, runs the tests and the build, then pushes; any
  failure rolls back to the previous version (code and `dist/`) and points to `UPDATE-AI.md`.
- `UPDATE-AI.md`: how an AI assistant updates the fork from upstream by hand (remotes, conflict
  areas, migration rule, checks).
- Fork data migrations moved to their own timeline (`src/migrations/fork.ts`, key
  `tacetForgeDataVersion`) so upstream's next migration merges unchanged. Profiles and backups
  from the first fork release (stamped data version 10) are read as 9, so nothing is skipped;
  exports now also carry `meta.forkDataVersion`.
- Tests: one walks every character and echo set through the fork's features; the damage-peek
  test no longer depends on the computer's number format.
- Merged Wuthering Tools up to `1982e518`: Suoming released, Unspoken Rue weapon details
  restored. Kept `public/sitemap.xml` removed.
- **Remove duplicates** (Inventory → Echoes, next to Find duplicates): deletes extra copies of
  exact duplicates after a confirmation listing them. One copy per group stays; copies on a
  character, in a preset or locked are always kept, otherwise a favorite, else the oldest.
- **Duplicate question on import.** Importing echoes (Settings → Backup & Restore → Import echoes,
  and the image importer) asks "N possible duplicates found — Skip duplicates / Import anyway"
  (the image importer also offers Review…). Copies repeated inside one import count too. A full
  backup restore replaces all data, so it doesn't ask.

## 2026-10-23

- **Danger Zone → Delete all echoes**: deletes only the echo inventory. Echo slots in every
  character build are emptied and echo presets removed (the confirmation lists this and suggests
  a backup first); characters, weapons, buffs, rotations, teams, settings and protected
  characters stay.
- **Import echoes → Choose JSON file…**: loads a .json file into the import box (checked for
  valid JSON, max 20 MB); importing is still a separate click. Both the new and classic Settings.
- **Safer updates.** `start.bat` now installs updates only from this fork (fast-forward of
  `origin/master`, where changes arrive through reviewed PRs), with `npm ci --ignore-scripts`, and
  never pushes. New Wuthering Tools changes are only announced: an AI assistant merges them in a
  PR after reviewing the diff. `UPDATE-AI.md` rewritten as a self-contained brief (rules, review
  checklist before running upstream code, conflict map, red flags).
- Protected characters only lists characters holding echoes in the optimizer's eligible echo
  sets (all sets when none is picked); the others don't affect the run. Their protected/donor
  state is kept, and Protect all / Unlock all / Invert only change the characters shown.
