# Word Unscrambler

A small, dependency-free web tool: type any set of letters, hit **Submit**, and get
every word you can spell from those letters — sorted longest → shortest, shown as a
space-separated list. Everything runs client-side in the browser; there is no server.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The page (layout + styling) |
| `unscramble.js` | Core logic + page wiring. Also `require()`-able for tests |
| `words.txt` | Dictionary, one lowercase word per line (370k words) |
| `test.js` | Node test suite for the core solver |

## How it works

1. On load, the page fetches `words.txt` once.
2. For the user's input we count its letter frequencies (26-slot array for a–z).
3. We scan the dictionary, keeping every word whose letter counts fit inside the
   input's counts (`canSpell`). This is O(dictionary × 26), so even 12–15 letter
   inputs resolve in a few milliseconds.
4. Results are sorted longest-first, alphabetical as a tie-break, and rendered as a
   space-separated list with a word count.

Input is normalised (case-insensitive, non-letters stripped). Words shorter than
`MIN_WORD_LENGTH` (2) in `unscramble.js` are ignored — set it to 1 to include "a"/"i".

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

(Python's server allows `fetch()`; opening `index.html` from `file://` will not, due
to browser CORS.)

## Deploy to Cloudflare Pages (free)

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Pick the repo → **Begin setup**. Use these build settings:
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `/`
4. **Save and Deploy**. Cloudflare auto-redeploys on every push to the production branch.

The 3.9 MB `words.txt` is served gzip'd by Cloudflare, so it lands much smaller on
the wire (~1.2 MB) and is fetched once per page load.

## Changing the dictionary

Replace `words.txt` with any list of lowercase words, one per line — or regenerate
from a source file with:

```sh
node -e '
const fs=require("fs");
const set=new Set();
for(const w of fs.readFileSync(process.argv[1],"utf8").split(/\r?\n/)){
  const x=w.trim().toLowerCase();
  if(/^[a-z]{2,}$/.test(x)) set.add(x);
}
fs.writeFileSync("words.txt",[...set].sort().join("\n")+"\n");
console.log(set.size,"words");
' /path/to/source-list.txt
```

Smaller dictionaries make the initial fetch faster; bigger ones find more words.

## Tests

```sh
node test.js
```

Tests check normalisation, exact result-set equality against an independent naive
solver, longest-first ordering, and performance (<200 ms for 12-letter inputs).
