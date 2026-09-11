# Buzz Tools — Growth Roadmap

Status of every tool in the portal. Live tools live in `tools.json` and render on
the portal; everything here in `planned` is tracked until a tool page exists.

Current catalog: **5 live**, **37 planned** (agreed strategy: keep the portal
shipping only live tools; planned items land here until built).

Decisions (2026-09-11, @Alex/~DeepSeek):
- Manifest strategy **(b)** — `tools.json` ships live only; planned tracked here.
- Category identity moves to `portal.config.json` **ids** (existing tools migrate).
- **Featured** homepage section: not enabled yet — skipped until functionality exists.
- **Search**: Fuse.js (vendored).
- **Tool-page theme refactor**: deferred to a later pass.

## Live (in `tools.json`)

| Tool | Slug | Category (id) |
|---|---|---|
| Word Unscrambler | `word-unscrambler` | `games-fun` (word-games) |
| Word Scrambler | `word-scrambler` | `games-fun` (word-games) |
| Word to HTML Converter | `word-to-html` | `text-content` (formatting) |
| Sample Size Calculator | `sample-size-calculator` | `data-analytics` (statistics) |
| Margin of Error Calculator | `margin-of-error` | `data-analytics` (statistics) |
| QR Code Generator | `qr-code-generator` | `design-frontend` (images) — *code on unmerged `qr-code-generator` branch, not in main yet* |

## Planned (37 new tools)

Effort is a draft estimate (XS/S/M/L) — refine as each tool is scoped.

### Developer Utilities (`dev-utilities`) — 12

| Slug | Name | Subcategory | Effort (draft) |
|---|---|---|---|
| `regex-tester` | Regex Tester & Explainer | reference | M |
| `cron-expression-explainer` | Cron Expression Explainer & Visualizer | cli-tools | M |
| `jwt-debugger` | JWT Debugger & Token Visualizer | api-tools | S |
| `sql-query-builder` | SQL Query Builder & Formatter (Visual) | database | XL |
| `base64-encoder-decoder` | Base64 / Base64URL Encoder & Decoder | encoding | XS |
| `diff-patch-visualizer` | Diff & Patch Visualizer (unified/context/git) | cli-tools | L |
| `http-request-builder` | HTTP Request Builder & Tester (Postman-lite) | api-tools | L |
| `uuid-generator` | UUID / ULID / NanoID Generator & Validator | encoding | XS |
| `openapi-visualizer` | OpenAPI / Swagger Spec Visualizer & Diff | api-tools | L |
| `diagram-as-code-editor` | Diagram-as-Code Live Editor (PlantUML, Mermaid, D2, GraphViz, Kroki) | reference | XL |
| `redis-command-builder` | Redis Command Builder & Protocol Explorer | database | M |
| `cheatsheet-hub` | Interactive Cheatsheet & Reference Hub | reference | M |

### Design & Frontend (`design-frontend`) — 7

| Slug | Name | Subcategory | Effort (draft) |
|---|---|---|---|
| `color-palette-generator` | Color Palette Generator & Accessibility Checker | color | S |
| `markdown-html-converter` | Markdown ↔ HTML Converter (Bidirectional) | layout | M |
| `qr-code-generator` | QR Code Generator & Scanner | images | S |
| `timestamp-converter` | Timestamp & Date/Time Converter | layout | M |
| `mermaid-live-editor` | Mermaid Live Editor & Diagram Generator | diagrams | L |
| `svg-editor` | SVG Editor, Optimizer & Sprite Sheet Generator | images | XL |
| `css-layout-playground` | CSS Grid & Flexbox Playground | layout | L |

### Data & Analytics (`data-analytics`) — 6

| Tool | Name | Subcategory | Effort(draft) |
|---|---|---|---|
| `data-explorer` | CSV/JSON/TSV/Excel Data Explorer & Transformer | exploration | L |
| `markdown-table-generator` | Markdown Table Generator & Editor | exploration | S |
| `image-optimizer` | Image Optimizer & Multi-Format Converter | exploration | M |
| `bundle-size-analyzer` | Bundle Size Analyzer & Visualizer | exploration | M |
| `graphql-playground` | GraphQL Query Builder, Explorer & Playground | exploration | L |
| `feature-flag-dashboard` | Feature Flag & A/B Test Dashboard | experimentation | L |

### Security & Auth (`security-auth`) — 4

| Slug | Name | Subcategory | Effort (draft) |
|---|---|---|---|
| `password-generator` | Password Generator & Strength Analyzer | passwords | S |
| `certificate-key-inspector` | JWT / JWK / X.509 Certificate Inspector | tokens | L |
| `regex-cross-language-translator` | Regex Cross-Language Translator & Tester | education | M |
| `jwt-playground` | JWT Playground — Encode, Decode, Sign, Verify, Attack | tokens | L |

### Text & Content (`text-content`) — 4

| Slug | Name | Subcategory | Effort (draft) |
|---|---|---|---|
| `text-case-converter` | Text Case Converter & Formatter | formatting | XS |
| `ascii-art-generator` | ASCII / Unicode Art Generator & Figlet Font Renderer | generation | M |
| `lorem-ipsum-generator` | Lorem Ipsum & Design Content Generator | generation | S |
| `markdown-slides-generator` | Markdown Slide Deck Generator | presentation | M |

### Infrastructure & DevOps (`infrastructure`) — 4

| Slug | Name | Subcategory | Effort (draft) |
|---|---|---|---|
| `env-file-manager` | Environment Variable Manager & .env Validator | config | S |
| `webhook-inspector` | Webhook Inspector, Replay & Debugger | webhooks | M |
| `cron-schedule-visualizer` | Cron Schedule Visualizer & Timezone Converter | scheduling | S |
| `typescript-zod-generator` | TypeScript Type & Zod Schema Generator | specs | M |

### Games & Fun (`games-fun`) — existing only (0 new)

## Notes — scopes that overlap, decide before building

- **JWT trio**: `jwt-debugger` (dev), `certificate-key-inspector` (security), `jwt-playground` (security). Clarify boundaries (parse/view vs sign/attack) or consolidate.
- **Cron pair**: `cron-expression-explainer` (dev) vs `cron-schedule-visualizer` (infra).
- **Markdown family**: live `word-to-html` + `markdown-html-converter` + `markdown-table-generator` + `markdown-slides-generator`. Watch for feature creep; keep each focused.
- **QR Code Generator**: code exists on an `main`-unmerged `qr-code-generator` branch — reuse rather than rebuild when scoping the scanner upgrade.
