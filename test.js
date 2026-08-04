const { count, normalize, solve } = require("./unscramble.js");
const fs = require("fs");

// Build the dict exactly like loadDictionary() would (we just skip fetch).
const words = [], counts = [];
for (const raw of fs.readFileSync("words.txt", "utf8").split(/\r?\n/)) {
  const w = raw.trim();
  if (w) { words.push(w); counts.push(count(w)); }
}
const dict = { words, counts };

let failures = 0;
function check(name, cond) {
  if (cond) { console.log("PASS", name); }
  else { failures++; console.log("FAIL", name); }
}

// Independent reference implementation (different approach: multiset splice).
function naiveSpellable(w, letters) {
  const avail = [...letters];
  return [...w].every((ch) => {
    const i = avail.indexOf(ch);
    if (i === -1) return false;
    avail.splice(i, 1);
    return true;
  });
}

check("normalize strips junk + lowercases", normalize("A T C! 123") === "atc");
check("normalize handles empty", normalize("!!") === "");

for (const input of ["atc", "sleep", "build", "triangle", "zygote"]) {
  const got = solve(input, dict);
  const expected = dict.words.filter((w) => naiveSpellable(w, input))
    .sort((a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0));
  check(`#${input}: same set as reference`,
    got.length === expected.length &&
    got.every((g, i) => g === expected[i]));
  if (got.length) {
    const desc = got.every((w, i, a) => i === 0 || a[i - 1].length >= w.length);
    check(`#${input}: sorted longest-first (${got.length} words, first="${got[0]}")`, desc);
  }
}

// Every result must actually be spellable, and no valid word omitted.
for (const input of ["atc", "barbarian", "subsequence"]) {
  const got = new Set(solve(input, dict));
  const expect = new Set(dict.words.filter((w) => naiveSpellable(w, input)));
  check(`#${input}: set equality with reference`, 
    got.size === expect.size && [...got].every((x) => expect.has(x)));
}

// Sanity: known words appear, with sensible size.
const sleep = solve("sleep", dict);
check(`sleep includes "sleep"`, sleep.includes("sleep"));
check(`sleep includes "peels"`, sleep.includes("peels"));
const atc = solve("atc", dict);
check(`atc includes "cat" and "act"`, atc.includes("cat") && atc.includes("act"));
check("single-letter words excluded (MIN_WORD_LENGTH=2)", solve("a", dict).length === 0);

// Performance: a long-ish input must be instant.
let worst = 0;
for (const input of ["sleep", "unpredictable", "xylophones", "abcdefghij"]) {
  const t0 = process.hrtime.bigint();
  solve(input, dict);
  worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
}
console.log(`longest solve: ${worst.toFixed(1)} ms`);
check("solve < 200ms even for 12-letter inputs", worst < 200);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
