# Tacet Forge: hosting and images

## Running it

The app is a static site: `npm run build` writes everything to `dist/`, and every
calculation runs in the browser. There is no backend.

| Option | How | Notes |
|--------|-----|-------|
| **Local (Windows)** | double-click `start.bat` | Builds `dist/` if missing, then serves it with `scripts/serve-dist.mjs` on **http://localhost:4317** (Node only, no packages). |
| **Local (any OS)** | `npm run build && node scripts/serve-dist.mjs` | Same server, `--port N` to change it. |
| **Vercel / Netlify** | build command `npm run build`, output `dist` | Needs a rewrite of every path to `/index.html` (already in `vercel.json`; on Netlify add `/* /index.html 200` to `_redirects`). |
| **GitHub Pages** | publish `dist/` | Use a custom domain or a `<user>.github.io` repo: the router and some asset paths assume the app lives at `/`. Copy `dist/index.html` to `dist/404.html` so deep links work. |

**Why a fixed port.** All user data (characters, builds, inventory, settings) is in
`localStorage`, which is per *origin* (scheme + host + port). `http://localhost:4317`,
`http://127.0.0.1:4317` and `http://localhost:5173` are three different stores: moving to
another one looks like an empty app. Keep one address, and use Settings → Backup &amp;
Restore to move data between origins (or from wutheringtools.com).
`file://` does not work: module scripts, workers and the router need an http origin.

**Offline package.** Ship the full source tree (so the GPL source requirement is met and
it can be rebuilt) plus a prebuilt `dist/`, so `start.bat` runs without `npm` or network.
Images and the Google font still need internet (see below); without it the app works
but shows missing-image placeholders.

No public deploy is set up. Don't add one without the owner's OK.

## Images: hotlink vs mirror

Game images are not in this repo. They're loaded at runtime from:

| Host | Used for | References in `src/` |
|------|----------|---------------------|
| `api.encore.moe` (+ `api-v2`) | character, weapon, echo icons | ~1,100 |
| `ryanbenson.github.io/wuthering-waves-assets` | UI icons, stat icons, upstream's asset mirror | ~800 |
| `static.nanoka.cc` | newer icons | ~25 |
| `fonts.googleapis.com` | Figtree font | `index.html` |

**Current choice: hotlink (unchanged from upstream).**

- Pros: no game assets in the repo (they're Kuro Games' property, so not redistributing
  them is the safer legal position); zero hosting cost; new icons arrive when the hosts add them.
- Risks: any host can go down, rate-limit, block other referrers, or change paths, and
  images break with no warning; the hosts see visitors' IP addresses (stated on the Privacy
  page); `ryanbenson.github.io` is upstream's personal mirror and may be removed if the
  project ends; encore.moe is a datamine site, which upstream's rules say must not be
  *cited* in user-facing copy (loading images from it is how upstream already works).

**Option: mirror.** Copy the referenced files to our own static host (a separate assets
repo/bucket, not this repo) and rewrite the URL prefixes in one place.

- Pros: independent of third-party uptime; works offline if bundled with the local package.
- Risks/costs: we'd be redistributing copyrighted game art (fan-site norms tolerate it, but
  removal requests become ours to handle, see the Legal page); a few thousand files to keep in
  sync with every patch; bandwidth if hosted publicly.

**Middle ground** (if hotlinks start failing): a build-time URL prefix setting plus a
browser cache (service worker) for images already seen. Not implemented.

The UI should already show a fallback when an image fails to load; check that first if a
host breaks.
