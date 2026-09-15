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

/* ── splitLines (trailing-newline normalization) ── */
eq("splitLines plain", JSON.stringify(FC.splitLines("a\nb")), "[\"a\",\"b\"]");
eq("splitLines drops one phantom trailing empty", JSON.stringify(FC.splitLines("a\nb\n")), "[\"a\",\"b\"]");
eq("splitLines keeps real blank line", JSON.stringify(FC.splitLines("a\n\nb\n")), "[\"a\",\"\",\"b\"]");
eq("splitLines keeps genuine trailing blank line", JSON.stringify(FC.splitLines("a\nb\n\n")), "[\"a\",\"b\",\"\"]");
eq("splitLines single line no trailing newline", JSON.stringify(FC.splitLines("a")), "[\"a\"]");
eq("splitLines single newline only", JSON.stringify(FC.splitLines("\n")), "[\"\"]");
{
  const aLines = FC.splitLines("a\nb\n"), bLines = FC.splitLines("a\nb\n");
  const rows = FC.buildRows(FC.diffLines(aLines, bLines), aLines, bLines);
  eq("trailing \\n both sides → equal rows, no del/ins", rowStr(rows), "eq:1/1 eq:2/2");
  eq("trailing \\n both sides → no added/removed count",
     JSON.stringify(rows.stats),
     JSON.stringify({ same: 2, changed: 0, added: 0, removed: 0 }));
}
{
  const aLines = FC.splitLines("a\n"), bLines = FC.splitLines("a");
  const rows = FC.buildRows(FC.diffLines(aLines, bLines), aLines, bLines);
  eq("trailing \\n vs none → equal rows, no del/ins", rowStr(rows), "eq:1/1");
}
{
  const aLines = FC.splitLines("a\n"), bLines = FC.splitLines("a\n\n");
  const rows = FC.buildRows(FC.diffLines(aLines, bLines), aLines, bLines);
  eq("genuine extra blank line → real ins row", rowStr(rows), "eq:1/1 ins:-/2");
  eq("genuine blank line added stats",
     JSON.stringify(rows.stats),
     JSON.stringify({ same: 1, changed: 0, added: 1, removed: 0 }));
}

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

/* ── buildPaneLines (per-pane inline render) ── */
function paneStr(lines) { return lines.map((l) => l.cls).join(" "); }
{
  const a = ["keep", "old", "gone"];
  const b = ["keep", "new", "extra"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("pane a classes (eq+2 mods, 3 lines)", paneStr(FC.buildPaneLines(rows, "a")), "eq mod mod");
  eq("pane b classes mirror pane a", paneStr(FC.buildPaneLines(rows, "b")), "eq mod mod");
}
{
  const a = ["a", "b"];
  const b = ["a", "c", "d"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  eq("pane a skips inserted line", paneStr(FC.buildPaneLines(rows, "a")), "eq mod");
  eq("pane b keeps inserted line", paneStr(FC.buildPaneLines(rows, "b")), "eq mod ins");
}
{
  const rows = FC.buildRows(FC.diffLines(["x", "y"], ["x"]), ["x", "y"], ["x"]);
  eq("pane a keeps deleted line", paneStr(FC.buildPaneLines(rows, "a")), "eq del");
  eq("pane b omits deleted line", paneStr(FC.buildPaneLines(rows, "b")), "eq");
}
{
  const rows = FC.buildRows(FC.diffLines([], ["p", "q"]), [], ["p", "q"]);
  eq("pane a empty on prepended block", paneStr(FC.buildPaneLines(rows, "a")), "");
  eq("pane b all inserted", paneStr(FC.buildPaneLines(rows, "b")), "ins ins");
  eq("pane a html stayed empty", FC.buildPaneLines(rows, "a").length, 0);
}
{
  const a = ["price = 100"];
  const b = ["price = 150"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  const la = FC.buildPaneLines(rows, "a")[0];
  const lb = FC.buildPaneLines(rows, "b")[0];
  has("pane a mod carries word-removed mark", la.html, '<span class="wd">100</span>');
  has("pane b mod carries word-added mark", lb.html, '<span class="wi">150</span>');
}

/* ── buildBlocks (change-map block grouping) ── */
function blockStr(blocks) {
  return blocks.map((b) => {
    const la = b.minLa != null ? b.minLa + ".." + b.maxLa : "-";
    const lb = b.minLb != null ? b.minLb + ".." + b.maxLb : "-";
    return b.kind + ":" + la + "/" + lb;
  }).join(" | ");
}
{
  const a = ["keep", "old", "gone"];
  const b = ["keep", "new", "extra"];
  const rows = FC.buildRows(FC.diffLines(a, b), a, b);
  const blocks = FC.buildBlocks(rows);
  eq("blocks: mod pair → 1 mod block", blockStr(blocks), "mod:2..3/2..3");
  eq("blocks: mod pair count", blocks.length, 1);
}
{
  const rows = FC.buildRows(FC.diffLines(["x", "y"], ["x"]), ["x", "y"], ["x"]);
  eq("blocks: pure delete → del block (no B side)", blockStr(FC.buildBlocks(rows)), "del:2..2/-");
}
{
  const rows = FC.buildRows(FC.diffLines(["q"], ["p", "q"]), ["q"], ["p", "q"]);
  eq("blocks: prepended insert → ins block (no A side)", blockStr(FC.buildBlocks(rows)), "ins:-/1..1");
}
{
  const rows = [
    { cls: "eq", la: 1, lb: 1 },
    { cls: "del", la: 5, lb: null }, { cls: "del", la: 6, lb: null },
    { cls: "ins", la: null, lb: 4 }, { cls: "ins", la: null, lb: 5 },
    { cls: "eq", la: 9, lb: 9 },
    { cls: "ins", la: null, lb: 20 }
  ];
  const blocks = FC.buildBlocks(rows);
  eq("blocks: separate regions split", blocks.length, 2);
  eq("blocks: mixed del+ins becomes mod", blockStr(blocks), "mod:5..6/4..5 | ins:-/20..20");
}
{
  eq("blocks: empty row list → none", FC.buildBlocks([]).length, 0);
  const rows = FC.buildRows(FC.diffLines(["a", "b"], ["a", "b"]), ["a", "b"], ["a", "b"]);
  eq("blocks: identical texts → none", FC.buildBlocks(rows).length, 0);
}

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
