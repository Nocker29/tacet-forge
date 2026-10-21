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
