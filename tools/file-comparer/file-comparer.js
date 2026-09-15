/* file-comparer.js — side-by-side plain-text comparison (WinMerge-style).
 * All client-side, no data sent anywhere.
 *
 * Pure engine: Myers O(ND) line diff + word-level inline highlighting +
 * aligned render rows. UI: two panes that ARE the diff — each pane is an
 * editable textarea with a line-number gutter and a diff-highlight layer
 * rendered behind the text (line + word marks), so comparison happens where
 * you paste. Compare button / Ctrl+Cmd+Enter re-run.
 */
var FileComparer = (function () {
  "use strict";

  /* ── engine: Myers diff ───────────────────────────────── */
  /* diffLines(a, b) — a, b arrays of comparable items; returns ops in order:
   *   { t: "=", a: i, b: j }  equal (both present)
   *   { t: "-", a: i }        removed (left only)
   *   { t: "+", b: j }        added   (right only)          */
  function diffLines(a, b) {
    var N = a.length, M = b.length, max = N + M;
    var off = max;
    var v = new Int32Array(2 * max + 2);
    var trace = [Int32Array.from(v)];
    var d, k, x, y;
    for (d = 0; d <= max; d++) {
      for (k = -d; k <= d; k += 2) {
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= N && y >= M) { return backtrack(a, b, trace, d, off); }
      }
      trace.push(Int32Array.from(v));
    }
    return [];
  }

  function backtrack(a, b, trace, D, off) {
    var ops = [];
    var x = a.length, y = b.length, d, k, prevK, prevX, prevY;
    for (d = D; d > 0; d--) {
      var v = trace[d];
      k = x - y;
      if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) prevK = k + 1;
      else prevK = k - 1;
      prevX = v[off + prevK];
      prevY = prevX - prevK;
      while (x > prevX && y > prevY) { ops.push({ t: "=", a: x - 1, b: y - 1 }); x--; y--; }
      if (x === prevX) { ops.push({ t: "+", b: y - 1 }); y--; }
      else { ops.push({ t: "-", a: x - 1 }); x--; }
    }
    while (x > 0 && y > 0) { ops.push({ t: "=", a: x - 1, b: y - 1 }); x--; y--; }
    return ops.reverse();
  }

  function splitWords(str) {
    return String(str).split(/(\s+)/);
  }

  /* word-level diff on a changed line pair → { left, right } highlighted HTML */
  function wordHighlight(aStr, bStr) {
    var ta = splitWords(aStr), tb = splitWords(bStr);
    var ops = diffLines(ta, tb);
    var left = "", right = "";
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.t === "=") { left += escHtml(ta[o.a]); right += escHtml(tb[o.b]); }
      else if (o.t === "-") { left += '<span class="wd">' + escHtml(ta[o.a]) + "</span>"; }
      else { right += '<span class="wi">' + escHtml(tb[o.b]) + "</span>"; }
    }
    return { left: left, right: right };
  }

  /* Group the op stream into aligned render rows. A run of "-" ops followed by
   * a run of "+" ops is a changed block: pair them line-by-line as "mod" rows
   * (with word highlights); leftover deletions → "del", leftover additions →
   * "ins". */
  function buildRows(ops, aLines, bLines) {
    var rows = [];
    var stats = { same: 0, changed: 0, added: 0, removed: 0 };
    var i, j, k, p, s;
    for (i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.t === "=") {
        stats.same++;
        rows.push({ cls: "eq", la: o.a + 1, lb: o.b + 1,
                    ca: escHtml(aLines[o.a]), cb: escHtml(bLines[o.b]) });
      } else if (o.t === "-") {
        j = i;
        while (j < ops.length && ops[j].t === "-") j++;   /* dels:  i..j-1 */
        k = j;
        while (k < ops.length && ops[k].t === "+") k++;   /* adds:  j..k-1 */
        var delCount = j - i, addCount = k - j;
        var pairs = Math.min(delCount, addCount);
        for (p = 0; p < pairs; p++) {
          var di = ops[i + p].a, ai = ops[j + p].b;
          stats.changed++;
          var wh = wordHighlight(aLines[di], bLines[ai]);
          rows.push({ cls: "mod", la: di + 1, lb: ai + 1, ca: wh.left, cb: wh.right });
        }
        for (s = pairs; s < delCount; s++) {
          stats.removed++;
          rows.push({ cls: "del", la: ops[i + s].a + 1, lb: null,
                      ca: escHtml(aLines[ops[i + s].a]), cb: "" });
        }
        for (s = pairs; s < addCount; s++) {
          stats.added++;
          rows.push({ cls: "ins", la: null, lb: ops[j + s].b + 1,
                      ca: "", cb: escHtml(bLines[ops[j + s].b]) });
        }
        i = k - 1;
      } else {
        /* "+" with no preceding "-" (start of file) */
        stats.added++;
        rows.push({ cls: "ins", la: null, lb: o.b + 1, ca: "", cb: escHtml(bLines[o.b]) });
      }
    }
    rows.stats = stats;
    return rows;
  }

  /* Per-pane line list from render rows, in pane line order:
   *   side "a": every row that has a left line (eq/mod/del) → { cls, html }
   *   side "b": every row that has a right line (eq/mod/ins)
   * The returned array entries line up 1:1 with that pane's textarea lines. */
  function buildPaneLines(rows, side) {
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (side === "a") {
        if (r.la == null) continue;
        lines.push({ cls: r.cls, html: r.ca });
      } else {
        if (r.lb == null) continue;
        lines.push({ cls: r.cls, html: r.cb });
      }
    }
    return lines;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Group changed render rows into vertical blocks for the change map.
   * Each change block: { minLa, maxLa, minLb, maxLb, kind } where kind is
   * "mod" (contains modified or mixed rows), "del" (removed lines only),
   * or "ins" (added lines only). Line numbers are 1-based pane line numbers;
   * a null side means the block only exists on the other side. */
  function buildBlocks(rows) {
    var blocks = [];
    var cur = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.cls === "eq") { cur = null; continue; }
      if (!cur) {
        cur = { minLa: null, maxLa: null, minLb: null, maxLb: null, kind: null };
        blocks.push(cur);
      }
      if (r.la != null) {
        if (cur.minLa == null || r.la < cur.minLa) cur.minLa = r.la;
        if (cur.maxLa == null || r.la > cur.maxLa) cur.maxLa = r.la;
      }
      if (r.lb != null) {
        if (cur.minLb == null || r.lb < cur.minLb) cur.minLb = r.lb;
        if (cur.maxLb == null || r.lb > cur.maxLb) cur.maxLb = r.lb;
      }
      /* kind: mod wins; otherwise a mix of del+ins → mod */
      if (cur.kind !== "mod") {
        if (r.cls === "mod") cur.kind = "mod";
        else if (r.cls === "del") cur.kind = cur.kind === "ins" ? "mod" : "del";
        else if (r.cls === "ins") cur.kind = cur.kind === "del" ? "mod" : "ins";
      }
    }
    return blocks;
  }

  /* ── UI ───────────────────────────────────────────────── */
  var inputA, inputB, nameA, nameB, compareBtn, clearBtn, sampleBtn,
      status, diffSummary, gutterA, gutterB, fillA, fillB,
      countAChars, countALines, countBChars, countBLines,
      editorA, editorB, cmBody, resizeHandle;
  var lastBlocks = [];          /* change blocks from the latest Compare */
  var lastLineH = 20;           /* measured pane line height (px) */
  var EDITOR_H_KEY = "file-comparer.editorH";
  var EDITOR_H_MIN = 160, EDITOR_H_MAX = 900;

  var SAMPLE_A =
    "function formatName(first, last) {\n" +
    "  var full = last + \", \" + first;\n" +
    "  if (full.length > 20) {\n" +
    "    return full.slice(0, 20);\n" +
    "  }\n" +
    "  return full;\n" +
    "}\n" +
    "\n" +
    "function greet(name) {\n" +
    "  return \"Hello, \" + name + \"!\";\n" +
    "}\n";

  var SAMPLE_B =
    "function formatName(firstName, lastName) {\n" +
    "  var full = lastName + \", \" + firstName;\n" +
    "  if (full.length > 24) {\n" +
    "    return full.slice(0, 24) + \"…\";\n" +
    "  }\n" +
    "  return full;\n" +
    "}\n" +
    "function greet(name) {\n" +
    "  if (!name) return \"Hello, stranger!\";\n" +
    "  return \"Hello, \" + name + \"!\";\n" +
    "}\n";

  function lineCount(v) {
    return v === "" ? 0 : v.split("\n").length;
  }

  function showStatus(msg, isError) {
    status.textContent = msg;
    status.style.color = isError ? "#dc2626" : "";
  }

  function updateCount(ta, charsEl, linesEl) {
    var v = ta.value;
    charsEl.textContent = v.length.toLocaleString();
    linesEl.textContent = lineCount(v).toLocaleString();
  }

  function renderGutter(gInner, count) {
    var html = "";
    for (var i = 1; i <= count; i++) html += '<div class="gn">' + i + "</div>";
    gInner.innerHTML = html;
  }

  function renderFill(fEl, lines, side) {
    var html = "";
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      html += '<div class="ln ' + side + " " + l.cls + '">' + l.html + "</div>";
    }
    fEl.innerHTML = html;
  }

  function syncScrolls(ta, gInner, fEl) {
    gInner.style.transform = "translateY(" + (-ta.scrollTop) + "px)";
    fEl.style.transform = "translate(" + (-ta.scrollLeft) + "px," + (-ta.scrollTop) + "px)";
  }

  /* an edit invalidates the diff highlights → drop them + refresh gutter/counts */
  function onPaneInput(ta, gInner, charsEl, linesEl, side) {
    updateCount(ta, charsEl, linesEl);
    renderGutter(gInner, lineCount(ta.value));
    (side === "a" ? fillA : fillB).innerHTML = "";
    clearChangeMap();
    diffSummary.textContent = "";
    showStatus("Edited — press Compare (or Ctrl/Cmd+Enter) to re-run the diff.");
  }

  function storeName(key, value) {
    try { localStorage.setItem("file-comparer." + key, value); } catch (e) {}
  }
  function loadName(key, fallback) {
    try {
      var v = localStorage.getItem("file-comparer." + key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function syncNames() {
    storeName("nameA", nameA.value);
    storeName("nameB", nameB.value);
  }

  /* measure the pane line height from the rendered fill (fallback 20px) */
  function measureLineH() {
    var l = (fillA && fillA.children[0]) || (fillB && fillB.children[0]);
    if (l && l.offsetHeight > 0) { lastLineH = l.offsetHeight; return; }
    var f = fillA || fillB;
    if (f) { var c = getComputedStyle(f).lineHeight; var n = parseFloat(c); if (n > 0) lastLineH = n; }
  }

  /* position a change-block's representative line as a fraction of the doc */
  function blockTopFrac(b, total) {
    var rep = b.minLa != null ? b.minLa : (b.minLb != null ? b.minLb : 1);
    return Math.min(1, Math.max(0, (rep - 0.5) / (total || 1)));
  }

  function clearChangeMap() {
    cmBody.innerHTML = "";
    lastBlocks = [];
  }

  function renderChangeMap(blocks, totalA, totalB) {
    cmBody.innerHTML = "";
    lastBlocks = blocks;
    var total = Math.max(totalA, totalB);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var m = document.createElement("div");
      m.className = "cm-marker cm-" + b.kind;
      m.style.top = (blockTopFrac(b, total) * 100).toFixed(3) + "%";
      var a = b.minLa != null ? b.minLa : (b.minLb != null ? "—" : "");
      var c = b.minLb != null ? b.minLb : (b.minLa != null ? "—" : "");
      m.title = "Jump to diff at line " + a + " / " + c;
      m.setAttribute("role", "button");
      m.tabIndex = 0;
      m.addEventListener("click", function (ev) {
        scrollToBlock(Number(ev.currentTarget.getAttribute("data-i")));
      });
      m.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          scrollToBlock(Number(ev.currentTarget.getAttribute("data-i")));
        }
      });
      m.setAttribute("data-i", String(i));
      frag.appendChild(m);
    }
    cmBody.appendChild(frag);
  }

  /* scroll both textareas so the chosen diff block is at the top */
  function scrollToBlock(idx) {
    var b = lastBlocks[idx];
    if (!b || !cmBody.children[idx]) return;
    var aLines = inputA.value.split("\n"), bLines = inputB.value.split("\n");
    var la = b.minLa, lb = b.minLb;
    if (la == null) la = Math.max(1, Math.round(((lb || 1) / (bLines.length || 1)) * (aLines.length || 1)));
    if (lb == null) lb = Math.max(1, Math.round(((la) / (aLines.length || 1)) * (bLines.length || 1)));
    var maxA = Math.max(0, inputA.scrollHeight - inputA.clientHeight);
    var maxB = Math.max(0, inputB.scrollHeight - inputB.clientHeight);
    inputA.scrollTop = Math.min((la - 1) * lastLineH, maxA);
    inputB.scrollTop = Math.min((lb - 1) * lastLineH, maxB);
    syncScrolls(inputA, gutterA, fillA);
    syncScrolls(inputB, gutterB, fillB);
  }

  /* ---- synchronous panel-height resize (both panes together) ---- */
  function applyEditorHeight(h) {
    h = Math.max(EDITOR_H_MIN, Math.min(EDITOR_H_MAX, Math.round(h)));
    editorA.style.height = h + "px";
    editorB.style.height = h + "px";
  }
  function persistEditorHeight() {
    storeName("editorH", String(parseFloat(editorA.style.height) || ""));
  }
  function setupResize() {
    var dragging = false, startY = 0, startH = 0;
    resizeHandle.addEventListener("pointerdown", function (e) {
      dragging = true;
      startY = e.clientY;
      startH = editorA.offsetHeight;
      resizeHandle.classList.add("dragging");
      document.body.classList.add("resizing");
      try { resizeHandle.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    resizeHandle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      applyEditorHeight(startH + (e.clientY - startY));
    });
    function endResize() {
      if (!dragging) return;
      dragging = false;
      resizeHandle.classList.remove("dragging");
      document.body.classList.remove("resizing");
      persistEditorHeight();
    }
    resizeHandle.addEventListener("pointerup", endResize);
    resizeHandle.addEventListener("pointercancel", endResize);
  }
  function restoreEditorHeight() {
    try {
      var v = localStorage.getItem(EDITOR_H_KEY);
      var n = v === null ? NaN : Number(v);
      if (!isNaN(n) && n >= EDITOR_H_MIN && n <= EDITOR_H_MAX) applyEditorHeight(n);
    } catch (e) {}
  }

  function compare() {
    var a = inputA.value, b = inputB.value;
    if (!a.trim() || !b.trim()) {
      showStatus("Paste text into both panels first.", true);
      return;
    }
    var aLines = a.split("\n"), bLines = b.split("\n");
    var rows = buildRows(diffLines(aLines, bLines), aLines, bLines);
    var st = rows.stats;
    renderFill(fillA, buildPaneLines(rows, "a"), "a");
    renderFill(fillB, buildPaneLines(rows, "b"), "b");
    renderGutter(gutterA, aLines.length);
    renderGutter(gutterB, bLines.length);
    measureLineH();
    renderChangeMap(buildBlocks(rows), aLines.length, bLines.length);

    if (st.changed + st.added + st.removed === 0) {
      diffSummary.textContent = "No differences — the texts are identical.";
      showStatus("No differences — the texts are identical.");
    } else {
      diffSummary.textContent = st.same + " equal · " + st.changed + " changed · "
                              + st.added + " added · " + st.removed + " removed";
      showStatus("Compared.");
    }
  }

  function clearAll() {
    inputA.value = "";
    inputB.value = "";
    updateCount(inputA, countAChars, countALines);
    updateCount(inputB, countBChars, countBLines);
    renderGutter(gutterA, 0);
    renderGutter(gutterB, 0);
    fillA.innerHTML = "";
    fillB.innerHTML = "";
    clearChangeMap();
    diffSummary.textContent = "";
    showStatus("");
    inputA.focus();
  }

  function loadSample() {
    inputA.value = SAMPLE_A;
    inputB.value = SAMPLE_B;
    updateCount(inputA, countAChars, countALines);
    updateCount(inputB, countBChars, countBLines);
    renderGutter(gutterA, lineCount(SAMPLE_A));
    renderGutter(gutterB, lineCount(SAMPLE_B));
    fillA.innerHTML = "";
    fillB.innerHTML = "";
    clearChangeMap();
    diffSummary.textContent = "";
    showStatus("Sample loaded — click Compare or press Ctrl/Cmd+Enter.");
    inputA.focus();
  }

  function init(doc) {
    doc = doc || document;
    inputA = doc.getElementById("input-a");
    inputB = doc.getElementById("input-b");
    nameA = doc.getElementById("name-a");
    nameB = doc.getElementById("name-b");
    compareBtn = doc.getElementById("compare-btn");
    clearBtn = doc.getElementById("clear-btn");
    sampleBtn = doc.getElementById("sample-btn");
    status = doc.getElementById("status");
    diffSummary = doc.getElementById("diff-summary");
    gutterA = doc.getElementById("gutter-a");
    gutterB = doc.getElementById("gutter-b");
    fillA = doc.getElementById("fill-a");
    fillB = doc.getElementById("fill-b");
    countAChars = doc.getElementById("count-a-chars");
    countALines = doc.getElementById("count-a-lines");
    countBChars = doc.getElementById("count-b-chars");
    countBLines = doc.getElementById("count-b-lines");
    editorA = doc.getElementById("editor-a");
    editorB = doc.getElementById("editor-b");
    cmBody = doc.getElementById("cm-body");
    resizeHandle = doc.getElementById("resize-handle");

    nameA.value = loadName("nameA", "File A");
    nameB.value = loadName("nameB", "File B");
    nameA.addEventListener("input", syncNames);
    nameB.addEventListener("input", syncNames);

    inputA.addEventListener("input", function () {
      onPaneInput(inputA, gutterA, countAChars, countALines, "a");
    });
    inputB.addEventListener("input", function () {
      onPaneInput(inputB, gutterB, countBChars, countBLines, "b");
    });
    inputA.addEventListener("scroll", function () { syncScrolls(inputA, gutterA, fillA); });
    inputB.addEventListener("scroll", function () { syncScrolls(inputB, gutterB, fillB); });

    updateCount(inputA, countAChars, countALines);
    updateCount(inputB, countBChars, countBLines);
    renderGutter(gutterA, lineCount(inputA.value));
    renderGutter(gutterB, lineCount(inputB.value));

    compareBtn.addEventListener("click", compare);
    clearBtn.addEventListener("click", clearAll);
    sampleBtn.addEventListener("click", loadSample);
    setupResize();
    restoreEditorHeight();

    function keyHandler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        compare();
      }
    }
    inputA.addEventListener("keydown", keyHandler);
    inputB.addEventListener("keydown", keyHandler);

    inputA.focus();
  }

  return { init: init, diffLines: diffLines, wordHighlight: wordHighlight,
           buildRows: buildRows, buildPaneLines: buildPaneLines,
           buildBlocks: buildBlocks };
})();
