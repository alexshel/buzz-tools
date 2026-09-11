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
portal.config.json         Portal configuration: categories, homepage, search
scripts/
  add-tool.js              Scaffold generator: npm run tool:add -- --slug ...
tools/
  <tool-name>/
    index.html             The tool's page
    <tool-name>.js         Tool logic
    README.md              Tool documentation
    …                      Tool's own assets (data, tests, libs)
```

- The repo root is the **portal home**.
- Each tool lives under `tools/<tool-name>/` and is served at
  `https://buzz-tools.pages.dev/tools/<tool-name>/`.
- `portal.js` reads `tools.json` and `portal.config.json` and renders the shared header (site title + dynamic nav), the home-page tool grid, and the footer. The tool pages show the same header, so navigation is consistent across the whole portal.

## Data Model

### `tools.json` — Tool Manifest

Each tool entry:

```json
{
  "slug": "regex-tester",
  "name": "Regex Tester & Explainer",
  "description": "One-liner for cards/tooltips",
  "icon": "🔍",
  "category": "dev-utilities",
  "tags": ["regex", "testing", "developer"],
  "status": "planned|building|live|deprecated",
  "priority": 1,
  "estimatedEffort": "XS|S|M|L|XL",
  "seo": {
    "title": "Page title",
    "description": "Meta description",
    "keywords": ["keyword1", "keyword2"]
  }
}
```

**Categories** (from `portal.config.json`): `dev-utilities`, `design-frontend`, `data-analytics`, `security-auth`, `text-content`, `infrastructure`, `games-fun`

### `portal.config.json` — Portal Configuration

```json
{
  "categories": [
    {
      "id": "dev-utilities",
      "name": "Developer Utilities",
      "description": "...",
      "icon": "code",
      "order": 1,
      "color": "#4f46e5",
      "subcategories": [
        { "id": "api-tools", "name": "API & HTTP", "order": 1 }
      ]
    }
  ],
  "homepage": {
    "sections": [
      { "id": "featured", "type": "featured", "title": "Featured", "toolIds": [...], "layout": "grid", "limit": 5 },
      { "id": "dev-utilities", "type": "category", "title": "Developer Utilities", "categoryId": "dev-utilities", "layout": "grid", "limit": 6 }
    ]
  },
  "search": { "enabled": true, "engine": "fusejs", ... },
  "toolPage": { "showRelatedTools": true, "relatedBy": ["category", "tags"], ... }
}
```

## Adding a New Tool — 30-Second Workflow

**Option A: Scaffold script (recommended)**

```bash
node scripts/add-tool.js \
  --slug my-tool \
  --name "My Tool" \
  --category dev-utilities \
  --description "Does amazing things" \
  --icon "🔧" \
  --tags "tag1,tag2" \
  --priority 2 \
  --effort M
```

This creates:
- `tools/my-tool/index.html` — styled page with shared CSS variables
- `tools/my-tool/my-tool.js` — logic template with init/process pattern
- `tools/my-tool/README.md` — documentation stub

**Option B: Manual**

1. Create `tools/my-tool/` folder with `index.html` + `my-tool.js`
2. Include shared shell in `index.html`:
   ```html
   <link rel="stylesheet" href="../../portal.css">
   <header id="site-header"></header>
   <script src="../../portal.js"></script>
   ```
3. Add entry to `tools.json`

**That's it.** Menu, homepage, category pages, search index — all update automatically.

## Tool Page Template (Standardized)

All tools should follow this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tool Name</title>
  <link rel="stylesheet" href="../../portal.css">
  <style>
    :root { /* shared CSS variables — override accent color per category if desired */ }
    /* tool-specific styles only */
  </style>
</head>
<body>
  <header id="site-header"></header>
  <main class="card">
    <h1>Tool Name</h1>
    <p class="subtitle">One-sentence description</p>
    <form id="form">...</form>
    <p id="status" class="status"></p>
    <section id="output" class="output" hidden>...</section>
    <p class="foot">Runs entirely in your browser · No data leaves your machine</p>
  </main>
  <noscript>...</noscript>
  <script src="tool-name.js"></script>
  <script>ToolName.init(document);</script>
  <script src="../../portal.js"></script>
</body>
</html>
```

## Category Hierarchy & Cross-Category Discovery

- **Categories** defined in `portal.config.json` with ordering, icons, colors, and optional subcategories
- **Tags** on each tool enable cross-category discovery (related tools, search filtering)
- **Related tools** shown on tool pages based on shared category + tags
- **Search** (Fuse.js) indexes name, description, tags, category

## Cloudflare Pages

Deployed from GitHub — **Connect to Git → `alexshel/buzz-tools`** with:

- Framework preset: **None**
- Build command: *(empty)*
- Output directory: `/`
- Production branch: `main`

Every push to `main` auto-deploys to production. Pushes/prs on other branches get automatic preview deployments.

## Run Locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(`file://` won't work because `fetch()` of `tools.json` is blocked by browser CORS for local files.)

## Tests

```bash
# Word unscrambler test suite
cd tools/word-unscrambler && node test.js
```

## Scripts

```bash
# Scaffold a new tool
node scripts/add-tool.js --slug my-tool --name "My Tool" --category dev-utilities --description "..."

# Validate tools.json syntax
node -e "require('./tools.json')" && echo "✅ Valid JSON"
```

---

**Want to add a tool?** Run the scaffold script, implement your logic in the generated `.js` file, add the entry to `tools.json`, and push. The portal handles the rest. 🐝
