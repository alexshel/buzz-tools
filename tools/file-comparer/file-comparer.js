/* file-comparer.js — side-by-side plain-text comparison (WinMerge-style).
 * All client-side, no data sent anywhere.
 *
 * Pure engine: Myers O(ND) line diff + word-level inline highlighting +
 * aligned render rows. UI: two editable panels with renameable labels,
 * Compare button / Ctrl+Cmd+Enter re-run.
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

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── UI ───────────────────────────────────────────────── */
  var inputA, inputB, nameA, nameB, compareBtn, clearBtn, sampleBtn,
      status, diffEmpty, diffSection, diffGrid, diffNameA, diffNameB,
      diffSummary, countAChars, countALines, countBChars, countBLines;

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

  function showStatus(msg, isError) {
    status.textContent = msg;
    status.style.color = isError ? "#dc2626" : "";
  }

  function updateCount(ta, charsEl, linesEl) {
    var v = ta.value;
    charsEl.textContent = v.length.toLocaleString();
    linesEl.textContent = v === "" ? 0 : v.split("\n").length;
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
    diffNameA.textContent = nameA.value;
    diffNameB.textContent = nameB.value;
  }

  function renderRows(rows) {
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<span class="ln">' + (r.la || "") + "</span>"
            + '<span class="lc a ' + r.cls + '">' + r.ca + "</span>"
            + '<span class="ln">' + (r.lb || "") + "</span>"
            + '<span class="lc b ' + r.cls + '">' + r.cb + "</span>";
    }
    diffGrid.innerHTML = html;
  }

  function showDiff(show) {
    diffEmpty.style.display = show ? "none" : "flex";
    diffSection.hidden = !show;
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
    renderRows(rows);
    showDiff(true);

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
    showDiff(false);
    renderRows([]);
    showStatus("");
    inputA.focus();
  }

  function loadSample() {
    inputA.value = SAMPLE_A;
    inputB.value = SAMPLE_B;
    updateCount(inputA, countAChars, countALines);
    updateCount(inputB, countBChars, countBLines);
    showDiff(false);
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
    diffEmpty = doc.getElementById("diff-empty");
    diffSection = doc.getElementById("diff-section");
    diffGrid = doc.getElementById("diff-grid");
    diffNameA = doc.getElementById("diff-name-a");
    diffNameB = doc.getElementById("diff-name-b");
    diffSummary = doc.getElementById("diff-summary");
    countAChars = doc.getElementById("count-a-chars");
    countALines = doc.getElementById("count-a-lines");
    countBChars = doc.getElementById("count-b-chars");
    countBLines = doc.getElementById("count-b-lines");

    nameA.value = loadName("nameA", "File A");
    nameB.value = loadName("nameB", "File B");

    nameA.addEventListener("input", syncNames);
    nameB.addEventListener("input", syncNames);
    syncNames();

    function bindCount(ta, charsEl, linesEl) {
      ta.addEventListener("input", function () {
        updateCount(ta, charsEl, linesEl);
        showStatus("");
      });
    }
    bindCount(inputA, countAChars, countALines);
    bindCount(inputB, countBChars, countBLines);
    updateCount(inputA, countAChars, countALines);
    updateCount(inputB, countBChars, countBLines);

    compareBtn.addEventListener("click", compare);
    clearBtn.addEventListener("click", clearAll);
    sampleBtn.addEventListener("click", loadSample);

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
           buildRows: buildRows };
})();
