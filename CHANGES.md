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
