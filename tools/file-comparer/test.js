/* tools/file-comparer/test.js
 * Self-test for the File & Text Comparer — the pure diff engine (line diff,
 * word-level highlighting, aligned render rows).
 * Run: node tools/file-comparer/test.js
 * Uses the repo's jsdom devDependency just to provide a window to eval the
 * IIFE (the page itself runs in a real browser).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom"));

const src = fs.readFileSync(path.join(__dirname, "file-comparer.js"), "utf8");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
dom.window.eval(src);
const FC = dom.window.FileComparer;

if (!FC || typeof FC.diffLines !== "function") {
  console.error("converter did not expose diffLines");
  process.exit(1);
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = String(got), w = String(want);
  if (g === w) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + "\n   got:  " + JSON.stringify(g) + "\n   want: " + JSON.stringify(w)); }
}
function has(name, got, sub) {
  if (String(got).indexOf(sub) !== -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — missing " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}
function notHas(name, got, sub) {
  if (String(got).indexOf(sub) === -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — unexpected " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}

/* serialize ops into a compact string: "=1 +2 -3" (1-based indices) */
function opsStr(ops) {
  return ops.map(o => o.t + (o.t === "=" || o.t === "-" ? o.a + 1 : o.b + 1)).join(" ");
}
function rowStr(rows) {
  return rows.map(r => r.cls + ":" + (r.la || "-") + "/" + (r.lb || "-")).join(" ");
}

/* ── line diff ── */
eq("identical → all equal", opsStr(FC.diffLines(["a", "b"], ["a", "b"])), "=1 =2");
eq("append adds", opsStr(FC.diffLines(["a"], ["a", "b"])), "=1 +2");
eq("delete removes", opsStr(FC.diffLines(["a", "b"], ["a"])), "=1 -2");
eq("replace = del+add", opsStr(FC.diffLines(["a", "b", "c"], ["a", "x", "c"])), "=1 -2 +2 =3");
eq("empty left", opsStr(FC.diffLines([], ["a", "b"])), "+1 +2");
eq("empty right", opsStr(FC.diffLines(["a", "b"], [])), "-1 -2");
eq("both empty", opsStr(FC.diffLines([], [])), "");
eq("interleaved edit", opsStr(FC.diffLines(["1", "2", "3", "4"], ["1", "3", "5", "4"])), "=1 -2 =3 +3 =4");

/* ── word-level highlight ── */
{
  const wh = FC.wordHighlight("The quick brown fox", "The quick red fox");
  has("word diff left marks removed", wh.left, '<span class="wd">brown</span>');
  notHas("word diff left no added mark", wh.left, "wi");
  has("word diff right marks added", wh.right, '<span class="wi">red</span>');
  notHas("word diff right no removed mark", wh.right, "wd");
  has("word diff keeps context", wh.left, "quick");
}
{
  const wh = FC.wordHighlight("a b c", "a b c");
  eq("word diff identical", wh.left, "a b c");
  eq("word diff identical right", wh.right, "a b c");
}
{
  const wh = FC.wordHighlight("hello world", "hello");
  has("word diff removed trailing word", wh.left, '<span class="wd">world</span>');
  eq("word diff right keeps hello", wh.right, "hello");
}

/* ── buildRows (block pairing + stats) ── */
{
  const a = ["keep", "old", "gone"];
  const b = ["keep", "new", "extra"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("block paired mod rows", rowStr(rows), "eq:1/1 mod:2/2 mod:3/3");
  eq("block stats", JSON.stringify(rows.stats),
     JSON.stringify({ same: 1, changed: 2, added: 0, removed: 0 }));
}
{
  const a = ["a", "b"];
  const b = ["a", "c", "d"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("pair then extra add", rowStr(rows), "eq:1/1 mod:2/2 ins:-/3");
  eq("pair+add stats", JSON.stringify(rows.stats),
     JSON.stringify({ same: 1, changed: 1, added: 1, removed: 0 }));
}
{
  const rows = FC.buildRows(FC.diffLines([], []), [], []);
  eq("no rows for empty vs empty", rowStr(rows), "");
  eq("empty stats", JSON.stringify(rows.stats),
     JSON.stringify({ same: 0, changed: 0, added: 0, removed: 0 }));
}
{
  /* pure removal at end stays del rows */
  const a = ["x", "y"];
  const b = ["x"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("trailing remove row", rowStr(rows), "eq:1/1 del:2/-");
}
{
  /* mod pair content: left gets removed styling, right added styling */
  const a = ["price = 100"];
  const b = ["price = 150"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("mod row content", rows[0].cls + "|" + rows[0].ca + "|" + rows[0].cb,
     "mod|price = <span class=\"wd\">100</span>|price = <span class=\"wi\">150</span>");
}

/* ── HTML safety ── */
{
  const rows = FC.buildRows(FC.diffLines(["<b>&"], ["<b>&"]), ["<b>&"], ["<b>&"]);
  eq("equal row escapes html", rows[0].ca, "&lt;b&gt;&amp;");
}
{
  const wh = FC.wordHighlight("<script>alert(1)</script>", "safe");
  eq("word diff escapes html", wh.left.indexOf("<script>"), -1);
  has("word diff escaped left", wh.left, "&lt;script&gt;");
}

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
