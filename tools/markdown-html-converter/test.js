/* tools/markdown-html-converter/test.js
 * Self-test for the Markdown ↔ HTML converter (both directions).
 * Run: node tools/markdown-html-converter/test.js
 * Uses the repo's jsdom devDependency purely to provide DOMParser for the
 * HTML → Markdown path (the page itself runs in a real browser).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom"));

/* jsdom's window provides DOMParser even though the page uses the browser's. */
global.DOMParser = new JSDOM("").window.DOMParser;

const src = fs.readFileSync(path.join(__dirname, "markdown-html-converter.js"), "utf8");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
dom.window.eval(src);
const conv = dom.window.MarkdownHtmlConverter;

if (!conv || typeof conv.mdToHtml !== "function" || typeof conv.htmlToMd !== "function") {
  console.error("converter did not expose mdToHtml/htmlToMd");
  process.exit(1);
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = String(got).trim(), wv = String(want).trim();
  if (g === wv) { pass++; console.log("  ok  " + name); }
  else {
    fail++;
    console.log(" FAIL " + name + "\n   got:  " + JSON.stringify(g) + "\n   want: " + JSON.stringify(wv));
  }
}
function has(name, got, sub) {
  if (String(got).indexOf(sub) !== -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — missing " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}
function notHas(name, got, sub) {
  if (String(got).indexOf(sub) === -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — unexpected " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}

/* ══════ Markdown → HTML ══════ */

eq("md: h1", conv.mdToHtml("# Hello"), "<h1>Hello</h1>");
eq("md: h6", conv.mdToHtml("###### tiny"), "<h6>tiny</h6>");
eq("md: setext h1", conv.mdToHtml("Title\n====="), "<h1>Title</h1>");
eq("md: setext h2", conv.mdToHtml("Title\n-----"), "<h2>Title</h2>");
eq("md: paragraph", conv.mdToHtml("just text"), "<p>just text</p>");
eq("md: soft-break paragraph", conv.mdToHtml("line one\nline two"), "<p>line one line two</p>");
eq("md: bold italic strike", conv.mdToHtml("**b** *i* ~~s~~"), "<p><strong>b</strong> <em>i</em> <del>s</del></p>");
eq("md: bold+italic", conv.mdToHtml("***bi***"), "<p><strong><em>bi</em></strong></p>");
eq("md: inline code", conv.mdToHtml("a `b` c"), "<p>a <code>b</code> c</p>");
eq("md: fenced code no lang",
  conv.mdToHtml("```\nx = 1\n```"),
  "<pre><code>x = 1</code></pre>");
eq("md: fenced code with lang",
  conv.mdToHtml("```js\nlet a = 1;\n```"),
  "<pre><code class=\"language-js\">let a = 1;</code></pre>");
eq("md: blockquote", conv.mdToHtml("> quote"), "<blockquote>\n<p>quote</p>\n</blockquote>");
eq("md: nested blockquote",
  conv.mdToHtml("> a\n> > b"),
  "<blockquote>\n<p>a</p>\n<blockquote>\n<p>b</p>\n</blockquote>\n</blockquote>");
eq("md: tight ul",
  conv.mdToHtml("- a\n- b"),
  "<ul>\n<li>a</li>\n<li>b</li>\n</ul>");
eq("md: tight ol",
  conv.mdToHtml("1. a\n2. b"),
  "<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
eq("md: nested list",
  conv.mdToHtml("- parent\n  - child"),
  "<ul>\n<li>\n  <p>parent</p>\n  <ul>\n  <li>child</li>\n  </ul>\n</li>\n</ul>");
eq("md: link", conv.mdToHtml("[text](https://x.com)"), "<p><a href=\"https://x.com\">text</a></p>");
eq("md: image",
  conv.mdToHtml("![alt text](img.png)"),
  "<p><img src=\"img.png\" alt=\"alt text\"></p>");
eq("md: bare autolink",
  conv.mdToHtml("go to https://example.com now"),
  "<p>go to <a href=\"https://example.com\">https://example.com</a> now</p>");
eq("md: angle autolink",
  conv.mdToHtml("<https://example.com>"),
  "<p><a href=\"https://example.com\">https://example.com</a></p>");
eq("md: hr", conv.mdToHtml("---"), "<hr>");
eq("md: hr stars", conv.mdToHtml("***"), "<hr>");
eq("md: raw html escaped",
  conv.mdToHtml("<script>alert(1)</script>"),
  "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
eq("md: entities escaped", conv.mdToHtml("AT&T <b>"), "<p>AT&amp;T &lt;b&gt;</p>");
has("md: dangerous url kept literal",
  conv.mdToHtml("[x](javascript:alert(1))"), "javascript:alert(1)");
notHas("md: dangerous url no anchor",
  conv.mdToHtml("[x](javascript:alert(1))"), '<a href="javascript:');

/* ══════ HTML → Markdown ══════ */

eq("htm: h1", conv.htmlToMd("<h1>Hi</h1>"), "# Hi");
eq("htm: h2", conv.htmlToMd("<h2>Sub</h2>"), "## Sub");
eq("htm: p + strong/em", conv.htmlToMd("<p><strong>a</strong> and <em>b</em></p>"), "**a** and *b*");
eq("htm: del", conv.htmlToMd("<del>gone</del>"), "~~gone~~");
eq("htm: inline code", conv.htmlToMd("<p>use <code>fn()</code></p>"), "use `fn()`");
eq("htm: ul", conv.htmlToMd("<ul><li>a</li><li>b</li></ul>"), "- a\n- b");
eq("htm: ol", conv.htmlToMd("<ol><li>one</li></ol>"), "1. one");
eq("htm: nested list",
  conv.htmlToMd("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>"),
  "- a\n  - b\n- c");
eq("htm: blockquote", conv.htmlToMd("<blockquote><p>q</p></blockquote>"), "> q");
eq("htm: fenced code with lang",
  conv.htmlToMd("<pre><code class=\"language-js\">let x = 1;</code></pre>"),
  "```js\nlet x = 1;\n```");
eq("htm: hr", conv.htmlToMd("<hr>"), "---");
eq("htm: link", conv.htmlToMd('<a href="https://x.com">visit</a>'), "[visit](https://x.com)");
eq("htm: autolink-ish link", conv.htmlToMd('<a href="https://x.com">https://x.com</a>'), "<https://x.com>");
eq("htm: image",
  conv.htmlToMd('<img src="a.png" alt="pic" width="100">'),
  "![pic](a.png)");
eq("htm: strips inline style",
  conv.htmlToMd('<p style="color:red">hi</p>'), "hi");
eq("htm: strips presentational attrs",
  conv.htmlToMd('<p align="center">hi</p>'), "hi");
eq("htm: whitespace normalized",
  conv.htmlToMd("<p>hello   there\n\tfriend</p>"), "hello there friend");
eq("htm: table fallback rows",
  conv.htmlToMd("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"),
  "A | B\n1 | 2");
eq("htm: plain text passthrough", conv.htmlToMd("just words"), "just words");
has("htm: bold inside link",
  conv.htmlToMd('<a href="https://x.com"><strong>bold</strong></a>'),
  "[**bold**](https://x.com)");
eq("htm: div unwrap", conv.htmlToMd("<div><p>one</p><p>two</p></div>"), "one\n\ntwo");

/* ══════ Round-trip spot checks ══════ */

const rt = conv.mdToHtml("- a\n- b");
eq("rt: list -> md", conv.htmlToMd(rt), "- a\n- b");
const rt2 = conv.mdToHtml("> a\n> > b");
has("rt: nested quote preserved", conv.htmlToMd(rt2), "> > b");

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
