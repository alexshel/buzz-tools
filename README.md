# Buzz Tools

A small portal of free, dependency-free web utilities served on Cloudflare Pages.
Every tool is a static page that runs entirely in the browser — there is no
backend, no build step, and no data ever leaves the user's machine.

Live: **https://buzz-tools.pages.dev**

## Layout

```
index.html                 Portal home (hero + tool card grid)
portal.css, portal.js      Shared shell: header, nav, footer
tools.json                 Tool manifest — drives the header nav + home grid
tools/
  <tool-name>/
    index.html             The tool's page
    …                      Tool's own assets (js, data, tests)
```

- The repo root is the **portal home**.
- Each tool lives under `tools/<tool-name>/` and is served at
  `https://buzz-tools.pages.dev/tools/<tool-name>/`.
- `portal.js` reads `tools.json` and renders the shared header (site title +
  dynamic nav), the home-page tool grid, and the footer. The tool pages show the
  same header, so navigation is consistent across the whole portal.

## Adding a new tool

Two steps, no per-page edits anywhere else:

1. **Create the tool folder** `tools/<tool-name>/` with an `index.html` plus any
   assets it needs.
2. **Add one entry to `tools.json`** under `"tools"`:

   ```json
   {
     "slug": "word-unscrambler",
     "name": "Word Unscrambler",
     "description": "Type any set of letters and see every word you can spell — longest first.",
     "icon": "🔤",
     "category": "Word Puzzles & Games"
   }
   ```

   The `category` field groups tools in the header nav and the home-page grid.
   Use an existing category name to add to that group, or create a new one.
   The portal groups automatically by category — no config changes needed elsewhere.

For the tool page to show the shared shell, include three lines in its
`index.html`:

```html
<link rel="stylesheet" href="../../portal.css">   <!-- in <head> -->
<header id="site-header"></header>                <!-- top of <body> -->
<script src="../../portal.js"></script>           <!-- end of <body> -->
```

(`../../` is correct for pages at `tools/<tool-name>/`; the portal home at the
root uses `portal.css` / `portal.js` with no path prefix.)

## Cloudflare Pages

Deployed from GitHub — **Connect to Git → `alexshel/buzz-tools`** with:

- Framework preset: **None**
- Build command: *(empty)*
- Output directory: `/`
- Production branch: `main`

Every push to `main` auto-deploys to production. Pushes/prs on other branches
get automatic preview deployments at `https://<hash>.<project>.pages.dev`.

## Tests

The word unscrambler has a Node test suite:

```sh
cd tools/word-unscrambler && node test.js
```

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(`file://` won't work because `fetch()` of `words.txt`/`tools.json` is blocked
by browser CORS for local files.)
