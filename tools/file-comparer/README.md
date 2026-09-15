# File & Text Comparer

Compare two pieces of plain text side-by-side — line and word-level
highlighting, editable panels with renameable labels, all in your browser.
Nothing you paste is ever uploaded.

## Features

- **Side-by-side diff, inline where you paste**: each pane is an editable
  textarea with its own line-number gutter; after Compare, added / removed /
  modified lines are highlighted right there (WinMerge-style block pairing).
- **Word-level inline highlighting** inside changed lines — the exact words
  that changed are marked on each side.
- **Renameable panel names**: the labels above each pane are editable inputs
  (persisted), handy for labelling screenshots.
- **Change-map navigation**: a slim vertical bar to the left of the panes shows
  coloured markers where differences are (yellow changed / green added / red
  removed, scaled to the whole document); click a marker to jump both panes to
  that difference.
- **Resizable panels**: drag the handle below the panes to resize them together
  (persisted between visits; clamped 160–900 px; hidden with the change-map on
  narrow screens where the panes stack).
- **Comparing is manual**: click **Compare** (or press Ctrl/Cmd+Enter in a
  panel) to re-run on edited text. Char/line counts update live as you type.
- Sample + Clear buttons and a change summary (equal · changed · added ·
  removed).
- Hand-rolled Myers line-diff engine — no runtime dependencies.

## Scope

**Plain-text comparison only in v1.** Binary "via upload" mode (hex view +
byte-level diff, read-only) is planned as a follow-up in a later session.

## Usage

Open `index.html` in a browser, or serve it:

```bash
npm run serve
# → http://localhost:8000/tools/file-comparer/
```

## Development

```bash
npm run serve            # local server
npm run test:file-comparer   # jsdom unit tests (engine + wiring)
npm run smoke            # portal shell regression (renders this tool)
npm run validate         # manifest sanity
```

## License

MIT
