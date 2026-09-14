/* tools/word-to-html/test.js
 * Self-test for the Word → clean HTML converter, focused on the two regressions
 * that were reported: (1) spaces eaten from Word pastes, (2) bullet/numbered
 * lists flattened.
 * Run: node tools/word-to-html/test.js
 * Uses the repo's jsdom devDependency purely to provide DOMParser (the page
 * itself runs in a real browser).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const { JSDOM } = require(path.join(ROOT, "node_modules", "jsdom"));

global.DOMParser = new JSDOM("").window.DOMParser;

const src = fs.readFileSync(path.join(__dirname, "word-to-html.js"), "utf8");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
dom.window.eval(src);
const W = dom.window.WordToHTML;

if (!W || typeof W.clean !== "function") {
  console.error("converter did not expose clean()");
  process.exit(1);
}

let pass = 0, fail = 0;
function has(name, got, sub) {
  if (String(got).indexOf(sub) !== -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — missing " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}
function notHas(name, got, sub) {
  if (String(got).indexOf(sub) === -1) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log(" FAIL " + name + " — unexpected " + JSON.stringify(sub) + " in " + JSON.stringify(String(got))); }
}

/* ── Word spacing (mso-spacerun) ── */
{
  const html = '<p class="MsoNormal">Hello<span style="mso-spacerun:yes">&nbsp;&nbsp;&nbsp;</span>world' +
    '<span style="mso-spacerun:yes">&nbsp;&nbsp;</span>gap here</p>';
  const out = W.clean(html, {});
  has("spacerun: multi-space run preserved",
    out, "Hello\u00a0\u00a0\u00a0world\u00a0\u00a0gap");
  notHas("spacerun: no leftover span", out, "<span");
  notHas("spacerun: no literal nbsp entity", out, "&nbsp;");

  const dbl = '<p>Hello   world  is here</p>';
  const outd = W.clean(dbl, {});
  has("plain double spaces preserved", outd, "Hello   world  is here");
}

/* ── Word mso-list → real lists ── */
{
  const BUL = '<![if !supportLists]><span style="mso-list:Ignore">&#183;' +
    '<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>';
  const bullets = '<p class="MsoNormal">Shopping:</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + BUL + 'Milk</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + BUL + 'Eggs</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + BUL + 'Bread</p>';
  const out = W.clean(bullets, {});
  has("mso-list bullets: ul present", out, "<ul>");
  has("mso-list bullets: li Milk", out, "<li>\n      Milk");
  has("mso-list bullets: li Eggs", out, "Eggs");
  has("mso-list bullets: li Bread", out, "Bread");
  notHas("mso-list bullets: no stray · marker", out, "·");
  notHas("mso-list bullets: no MsoListParagraph", out, "MsoListParagraph");

  /* marker via Symbol font (no mso-list:Ignore span) */
  const symBullets = '<p class="MsoListParagraph" style="text-indent:-.25in;mso-list:l0 level1 lfo1">' +
    '<![if !supportLists]><span style="font-family:Symbol">&#183;' +
    '<span style="font:7.0pt \'Times New Roman\'">&nbsp;</span></span><![endif]>Milk</p>' +
    '<p class="MsoListParagraph" style="text-indent:-.25in;mso-list:l0 level1 lfo1">' +
    '<![if !supportLists]><span style="font-family:Symbol">&#183;' +
    '<span style="font:7.0pt \'Times New Roman\'">&nbsp;</span></span><![endif]>Eggs</p>';
  const outSym = W.clean(symBullets, {});
  has("mso-list Symbol font: ul present", outSym, "<ul>");
  has("mso-list Symbol font: li Milk", outSym, "Milk");
  notHas("mso-list Symbol font: no · char", outSym, "·");

  /* ordered list + <o:p> text wrappers */
  const O = '<![if !supportLists]><span style="mso-list:Ignore">$N<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>';
  const ordered = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + O.replace("$N", "1.") + '<o:p>Install</o:p></p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + O.replace("$N", "2.") + 'Configure</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + O.replace("$N", "3.") + 'Deploy</p>';
  const outOl = W.clean(ordered, {});
  has("mso-list ordered: ol present", outOl, "<ol>");
  has("mso-list ordered: li Install", outOl, "Install");
  has("mso-list ordered: li Configure", outOl, "Configure");
  has("mso-list ordered: li Deploy", outOl, "Deploy");
  notHas("mso-list ordered: no stray 1. marker", outOl, "1.");
  notHas("mso-list ordered: no o:p", outOl, "<o:p");

  /* nested levels */
  const B2 = '<![if !supportLists]><span style="mso-list:Ignore">o<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>';
  const nested = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + BUL + 'Fruit</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">' + B2 + 'Apples</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">' + B2 + 'Pears</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + BUL + 'Dairy</p>';
  const outN = W.clean(nested, {});
  has("mso-list nested: nested ul present", outN, "<li>\n      Fruit\n          <ul>");
  has("mso-list nested: Apples", outN, "Apples");
  has("mso-list nested: Pears", outN, "Pears");
  has("mso-list nested: top Dairy", outN, "Dairy");

  /* ordered nesting (1, 2, back to 1) */
  const O2 = '<![if !supportLists]><span style="mso-list:Ignore">1.<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>';
  const OA = '<![if !supportLists]><span style="mso-list:Ignore">a.<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>';
  const nestedOl = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + O2 + 'Main</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">' + OA + 'Sub</p>' +
    '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' + O2 + 'Next</p>';
  const outNO = W.clean(nestedOl, {});
  has("mso-list nested ol: outer ol", outNO, "<ol>");
  has("mso-list nested ol: Sub nested", outNO, "Sub");
  has("mso-list nested ol: Next back at top", outNO, "Next");

  /* marker written as "mso-list: Ignore" (space after colon) */
  const spaced = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' +
    '<![if !supportLists]><span style="mso-list: Ignore">&#183;' +
    '<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>Zip</p>';
  const outS = W.clean(spaced, {});
  has("mso-list marker w/ space: ul", outS, "<ul>");
  has("mso-list marker w/ space: Zip", outS, "Zip");
}

/* ── genuine <ul>/<ol> untouched ── */
{
  const real = '<p>Intro</p><ul type="disc"><li>First</li><li>Second</li></ul>' +
    '<ol type="1"><li>Step one</li><li>Step two</li></ol>';
  const out = W.clean(real, {});
  has("real ul kept", out, "<ul>");
  has("real ol kept", out, "<ol>");
  has("real li First", out, "First");
  has("real li Step one", out, "Step one");
}

/* ── out of scope: <p>+<br> numbered lines stay untouched ── */
{
  const br = '<p class="MsoNormal">Things:<br>1. First numbered<br>2. Second numbered</p>';
  const out = W.clean(br, {});
  has("p+br sequence stays a paragraph", out, "<p>");
  has("p+br line text kept", out, "1. First numbered");
  notHas("p+br not guessed into ol", out, "<ol>");
}

/* ── plain text path ── */
{
  const out = W.clean("Hello   world\nsecond line with   spaces", {});
  has("plain text spaces kept", out, "Hello   world");
  has("plain text second line", out, "second line with   spaces");
}

/* ── option gates ── */
{
  const html = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1">' +
    '<![if !supportLists]><span style="mso-list:Ignore">&#183;' +
    '<span style="font:7.0pt \'Times New Roman\'">&nbsp;&nbsp;</span></span><![endif]>Milk</p>';
  const out = W.clean(html, { normalizeLists: false });
  notHas("normalizeLists=false: no list rebuilt", out, "<ul>");
  has("normalizeLists=false: paragraph kept", out, "<p>");
}

console.log("\n" + pass + " passed, " + fail + " failed.");
process.exit(fail ? 1 : 0);
