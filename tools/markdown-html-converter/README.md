# Markdown ↔ HTML Converter

Convert Markdown to HTML and back — a GitHub-Flavored Markdown subset with live
preview and semantic output. Everything runs in your browser; nothing is
uploaded.

## Features

- **Markdown → HTML (GFM subset):** headings (ATX + setext), paragraphs, bold,
  italic, strikethrough, inline code, fenced code blocks with language class,
  indented code, blockquotes (incl. nested), ordered/unordered lists (incl.
  nested), links, images, autolinks (`<url>` + bare http(s)/www), thematic
  breaks.
- **HTML → Markdown:** the semantic inverse — strips inline styles and
  presentational attributes, normalizes whitespace, emits ATX headings, fenced
  code, nested lists, etc.
- **Out of scope by design** (separate roadmap tools): tables, task lists,
  footnotes, slides.

## Usage

Open `index.html` in a browser, or serve it:

```bash
npm run serve
# → http://localhost:8000/tools/markdown-html-converter/
```

## Development

```bash
# Converter self-test (both directions, uses jsdom for DOMParser)
npm run test:converter

# Portal-wide gates
npm run validate   # 0 errors
npm run smoke      # all green
```

## Adding to Portal

Already live in `tools.json` (`status: "live"`). See `ROADMAP.md`.

## License

MIT
