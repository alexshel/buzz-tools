/* word-to-html.js — Word/rich-text → clean HTML converter.
 * All client-side, no data sent anywhere.
 *
 * Supports two input modes:
 *   - "richtext": contenteditable div, renders pasted HTML visually
 *   - "html": textarea showing raw markup
 */

var WordToHTML = (function () {
  "use strict";

  var inputRich, inputHtml, output, outputHtml, preview, status,
      convertBtn, copyBtn, clearBtn, clearInputBtn, sampleBtn,
      optStripStyles, optStripClasses, optRemoveEmpty, optNormalizeLists,
      charCount, tabs, emptyState, inputTabs, currentMode = "richtext";

  /* ── core cleaner ───────────────────────────────────────── */

  function clean(inputHtml, opts) {
    opts = opts || {};

    /* If input looks like plain text (no HTML tags), escape it */
    if (!/<\w+[^>]*>/i.test(inputHtml)) {
      return escHtml(inputHtml.trim());
    }

    var doc;
    try {
      var parser = new DOMParser();
      doc = parser.parseFromString(inputHtml, "text/html");
    } catch (e) {
      try {
        doc = parser.parseFromString("<div>" + inputHtml + "</div>", "text/html");
      } catch (e2) {
        return "<p><em>Could not parse input as HTML.</em></p>\n"
             + escHtml(inputHtml);
      }
    }

    var body = doc.body;

    /* 1. Strip inline styles */
    if (opts.stripStyles !== false) {
      var all = body.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        for (var attr of ["style","align","valign","bgcolor","border",
                          "cellpadding","cellspacing","width","height"]) {
          all[i].removeAttribute(attr);
        }
      }
    }

    /* 2. Strip classes and ids */
    if (opts.stripClasses !== false) {
      var all2 = body.querySelectorAll("*");
      for (var j = 0; j < all2.length; j++) {
        for (var attr2 of ["class","id","name","lang"]) {
          all2[j].removeAttribute(attr2);
        }
      }
    }

    /* 3. Remove Word-specific elements */
    var kill = [];
    var all3 = body.querySelectorAll("*");
    for (var k = 0; k < all3.length; k++) {
      var el = all3[k];
      var tag = el.tagName.toLowerCase();
      if (["style","xml","o:p","w:p"].indexOf(tag) !== -1 || tag.indexOf(":") !== -1) {
        kill.push(el);
      }
    }
    var classMso = body.querySelectorAll('[class*="Mso"], [class*="mso"]');
    for (var m = 0; m < classMso.length; m++) kill.push(classMso[m]);

    for (var n = 0; n < kill.length; n++) {
      if (kill[n].parentNode) kill[n].parentNode.removeChild(kill[n]);
    }

    /* 4. Strip empty elements (recursive) */
    if (opts.removeEmpty !== false) {
      var emptyTags = ["p","span","div","h1","h2","h3","h4","h5","h6",
                       "li","th","td","strong","em","u","ins","sub","sup"];
      var changed = true;
      while (changed) {
        changed = false;
        for (var p = 0; p < emptyTags.length; p++) {
          var nodes = body.querySelectorAll(emptyTags[p]);
          for (var q = 0; q < nodes.length; q++) {
            var e = nodes[q];
            if (!e.parentNode) continue;
            if ((e.textContent || "").trim() === "" && e.children.length === 0) {
              e.parentNode.removeChild(e);
              changed = true;
            }
          }
        }
      }
    }

    /* 5. Remove useless spans */
    var spans = body.querySelectorAll("span");
    for (var r = 0; r < spans.length; r++) {
      var span = spans[r];
      if (!span.hasAttribute("style") && !span.hasAttribute("class") && !span.hasAttribute("id")) {
        unwrap(span);
      }
    }

    /* 6. Normalize lists */
    if (opts.normalizeLists !== false) {
      var lists = body.querySelectorAll("ul, ol");
      for (var s = 0; s < lists.length; s++) tidyList(lists[s]);
    }

    /* 7. Clean images */
    var imgs = body.querySelectorAll("img");
    for (var t = 0; t < imgs.length; t++) imgs[t].removeAttribute("v:shapes");

    /* 8. Serialize */
    var result = "";
    for (var u = 0; u < body.childNodes.length; u++) {
      result += serializeNode(body.childNodes[u], 0);
    }

    result = result.replace(/\n{3,}/g, "\n\n").trim();
    return result || "<p><em>Cleaned content is empty.</em></p>\n";
  }

  /* ── serializers ────────────────────────────────────────── */

  function serializeNode(node, depth) {
    var indent = "  ".repeat(depth);
    if (node.nodeType === 3) {
      var t = (node.textContent || "").replace(/[\t\r\n]+/g, " ");
      return (t === "" || t === " ") ? "" : escHtml(t);
    }
    if (node.nodeType !== 1) return "";

    var tag = node.tagName.toLowerCase();
    var blockTags = ["p","div","h1","h2","h3","h4","h5","h6",
                     "ul","ol","li","table","tr","td","th","thead","tbody","tfoot",
                     "blockquote","pre","hr","br","section","article",
                     "header","footer","main","figure","figcaption","dl","dt","dd"];
    var isBlock = blockTags.indexOf(tag) !== -1;
    var isVoid = ["br","hr","img","input","link","area","base","col",
                  "source","track","wbr"].indexOf(tag) !== -1;

    var attrs = "";
    if (tag === "a" && node.href) {
      var h = node.getAttribute("href") || "";
      if (h) attrs += ' href="' + escAttr(h) + '"';
      if (node.target) attrs += ' target="' + escAttr(node.target) + '"';
    }
    if (tag === "img") {
      var src = node.getAttribute("src") || "";
      if (src) attrs += ' src="' + escAttr(src) + '"';
      var alt = node.getAttribute("alt") || "";
      if (alt) attrs += ' alt="' + escAttr(alt) + '"';
      ["width","height"].forEach(function (a) {
        var v = node.getAttribute(a);
        if (v) attrs += " " + a + '="' + escAttr(v) + '"';
      });
    }

    var openTag = "<" + tag + attrs + ">";
    if (isVoid) return openTag + "\n";

    var inner = "";
    for (var i = 0; i < node.childNodes.length; i++) {
      inner += serializeNode(node.childNodes[i], depth + 1);
    }
    inner = inner.trim();

    if (inner === "") return isBlock ? indent + openTag + "</" + tag + ">\n" : "";

    if (isBlock) {
      var ind = inner.replace(/\n/g, "\n" + indent + "  ");
      return "\n" + indent + openTag + "\n" + indent + "  " + ind + "\n" + indent + "</" + tag + ">\n";
    }
    return openTag + inner + "</" + tag + ">";
  }

  function escHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escAttr(str) { return escHtml(str); }

  function unwrap(el) {
    var parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  function tidyList(list) {
    var children = Array.prototype.slice.call(list.childNodes);
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.nodeType === 3) {
        var txt = (c.textContent || "").trim();
        if (txt) { var li = list.ownerDocument.createElement("li"); li.textContent = txt; list.replaceChild(li, c); }
        else { list.removeChild(c); }
      }
    }
  }

  /* ── UI ─────────────────────────────────────────────────── */

  function showStatus(msg, isError) {
    status.textContent = msg;
    status.style.color = isError ? "#dc2626" : "";
    if (!msg) status.textContent = "";
  }

  function getOptions() {
    return {
      stripStyles:   optStripStyles.checked,
      stripClasses:  optStripClasses.checked,
      removeEmpty:   optRemoveEmpty.checked,
      normalizeLists: optNormalizeLists.checked
    };
  }

  function updateCharCount(text) {
    charCount.textContent = (text || "").length.toLocaleString();
  }

  /* Get current input content based on active mode */
  function getInputContent() {
    if (currentMode === "richtext") {
      return inputRich.innerHTML;
    }
    return inputHtml.value;
  }

  function doConvert() {
    var content = getInputContent();
    if (!content || content.trim() === "" || content === "<br>") {
      showStatus("Paste or type some content first.", true);
      return;
    }

    var opts = getOptions();
    showStatus("Cleaning\u2026", false);

    try {
      var cleaned = clean(content, opts);
      outputHtml.textContent = cleaned;
      preview.innerHTML = cleaned;
      output.classList.add("has-result");
      emptyState.style.display = "none";
      updateCharCount(cleaned);
      activateTab("source");
      showStatus("Done");
    } catch (e) {
      showStatus("Error: " + e.message, true);
    } finally {
      convertBtn.disabled = false;
      convertBtn.textContent = "Convert";
    }
  }

  function activateTab(name) {
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var pid = tab.getAttribute("data-tab");
      var panel = document.getElementById("panel-" + pid);
      if (pid === name) {
        tab.classList.add("active");
        if (panel) panel.classList.add("active");
      } else {
        tab.classList.remove("active");
        if (panel) panel.classList.remove("active");
      }
    }
  }

  function setMode(mode) {
    currentMode = mode;
    /* Update tab UI */
    for (var i = 0; i < inputTabs.length; i++) {
      var t = inputTabs[i];
      if (t.getAttribute("data-mode") === mode) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    }
    /* Sync content between modes before toggling visibility */
    if (mode === "richtext") {
      /* Copy HTML mode content into rich text div */
      var htmlVal = inputHtml.value;
      inputHtml.className = "input-box input-box-hidden";
      inputRich.className = "input-box";
      if (htmlVal.trim()) {
        inputRich.innerHTML = htmlVal;
      }
      inputRich.focus();
    } else {
      /* Copy rich text content into HTML textarea */
      var richHtml = inputRich.innerHTML;
      inputRich.className = "input-box input-box-hidden";
      inputHtml.className = "input-box";
      if (richHtml && richHtml !== "<br>") {
        inputHtml.value = richHtml;
      }
      inputHtml.focus();
    }
  }

  function loadSample() {
    if (currentMode === "richtext") {
      inputRich.innerHTML = SAMPLE;
    } else {
      inputHtml.value = SAMPLE;
    }
    showStatus("Sample loaded. Click Convert.");
    output.classList.remove("has-result");
    outputHtml.textContent = "";
    preview.innerHTML = "";
    emptyState.style.display = "flex";
    updateCharCount("");
  }

  /* ── paste handlers ─────────────────────────────────────── */

  function handleRichPaste(e) {
    var html = null;
    if (e.clipboardData && e.clipboardData.getData) {
      html = e.clipboardData.getData("text/html");
    }
    if (html && html.trim()) {
      e.preventDefault();
      var sanitized = sanitizeClipboardHtml(html);

      /* Insert sanitized HTML at cursor */
      if (window.getSelection) {
        var sel = window.getSelection();
        if (sel.rangeCount > 0) {
          var range = sel.getRangeAt(0);
          range.deleteContents();
          var frag = range.createContextualFragment(sanitized);
          range.insertNode(frag);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          inputRich.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
      /* Fallback */
      inputRich.innerHTML += sanitized;
    }
    /* else: browser handles plain-text paste normally */
  }

  function handleHtmlPaste(e) {
    var html = null;
    if (e.clipboardData && e.clipboardData.getData) {
      html = e.clipboardData.getData("text/html");
    }
    if (html && html.trim()) {
      e.preventDefault();
      var sanitized = sanitizeClipboardHtml(html);
      var ta = inputHtml;
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + sanitized + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + sanitized.length;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.focus();
    }
  }

  /* ── paste sanitizer ────────────────────────────────────── */

  var STRIP_TAGS = {
    "button": true, "input": true, "select": true, "textarea": true,
    "option": true, "optgroup": true, "form": true, "fieldset": true,
    "legend": true, "label": true, "output": true, "progress": true,
    "meter": true, "datalist": true,
    "script": true, "style": true, "link": true, "meta": true,
    "iframe": true, "frame": true, "frameset": true, "noframes": true,
    "embed": true, "object": true, "applet": true, "param": true,
    "canvas": true, "noscript": true, "svg": true, "math": true,
    "audio": true, "video": true, "source": true, "track": true
  };

  function sanitizeClipboardHtml(html) {
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch (e) {
      return html;
    }
    stripUnwanted(doc.body);
    tameWidths(doc.body);
    return doc.body.innerHTML;
  }

  function stripUnwanted(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = children.length - 1; i >= 0; i--) {
      var child = children[i];
      if (child.nodeType === 1) {
        var tag = child.tagName.toLowerCase();
        if (STRIP_TAGS[tag]) {
          node.removeChild(child);
        } else {
          stripUnwanted(child);
        }
      }
    }
  }

  function tameWidths(node) {
    var all = node.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var style = el.getAttribute("style");
      if (style) {
        var tamed = style
          .replace(/\s*!important\s*/g, "")
          .replace(/;\s*width\s*:[^;]*/gi, "")
          .replace(/;\s*min-width\s*:[^;]*/gi, "")
          .replace(/;\s*max-width\s*:[^;]*/gi, "");
        tamed = tamed.replace(/^(width\s*:[^;]*);?/gi, "");
        tamed = tamed.replace(/^(min-width\s*:[^;]*);?/gi, "");
        tamed = tamed.replace(/^(max-width\s*:[^;]*);?/gi, "");
        tamed = tamed.trim();
        if (tamed) el.setAttribute("style", tamed);
        else el.removeAttribute("style");
      }
    }
  }

  /* ── sample data ────────────────────────────────────────── */

  var SAMPLE = '<h2>Project Summary: Q4 Planning</h2>\n'
    + '<p>This <strong>Quarterly Plan</strong> outlines the key deliverables for the <em>Platform Redesign</em> initiative.</p>\n'
    + '<table>\n'
    + '  <tr><th>Milestone</th><th>Owner</th><th>Due</th></tr>\n'
    + '  <tr><td>Design system v2</td><td>A.Kennedy</td><td>Oct 15</td></tr>\n'
    + '  <tr><td>Component audit</td><td>L.Chen</td><td>Oct 28</td></tr>\n'
    + '  <tr><td>User testing round 1</td><td>M.Patel</td><td>Nov 10</td></tr>\n'
    + '</table>\n'
    + '<p>Key <u>action items</u>:</p>\n'
    + '<ul>\n'
    + '  <li>Finalize <a href="https://example.com/spec">design spec</a> by Oct 5</li>\n'
    + '  <li>Schedule cross-team review</li>\n'
    + '  <li>Begin <strong>migration</strong> of existing components</li>\n'
    + '</ul>\n'
    + '<p><em>Classification: Internal</em></p>';

  /* ── init ────────────────────────────────────────────────── */

  function init(doc) {
    doc = doc || document;
    inputRich = doc.getElementById("input-richtext");
    inputHtml = doc.getElementById("input-html");
    output = doc.getElementById("output");
    outputHtml = doc.getElementById("output-html");
    preview = doc.getElementById("preview");
    status = doc.getElementById("status");
    convertBtn = doc.getElementById("convert-btn");
    copyBtn = doc.getElementById("copy-btn");
    clearBtn = doc.getElementById("clear-btn");
    clearInputBtn = doc.getElementById("clear-input-btn");
    sampleBtn = doc.getElementById("sample-btn");
    charCount = doc.getElementById("char-count");
    emptyState = doc.getElementById("output-empty");
    tabs = doc.querySelectorAll(".tab");
    inputTabs = doc.querySelectorAll(".input-tab");

    optStripStyles   = doc.getElementById("opt-strip-styles");
    optStripClasses  = doc.getElementById("opt-strip-classes");
    optRemoveEmpty   = doc.getElementById("opt-remove-empty");
    optNormalizeLists = doc.getElementById("opt-normalize-lists");

    /* ── Convert ── */
    convertBtn.addEventListener("click", function () {
      convertBtn.disabled = true;
      convertBtn.textContent = "Converting\u2026";
      setTimeout(function () { doConvert(); }, 50);
    });

    /* ── Copy ── */
    copyBtn.addEventListener("click", function () {
      var text = outputHtml.textContent;
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          var orig = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          setTimeout(function () { copyBtn.textContent = orig; }, 1800);
        });
      } else {
        var ta = doc.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        doc.body.appendChild(ta);
        ta.select();
        doc.execCommand("copy");
        doc.body.removeChild(ta);
        var orig = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = orig; }, 1800);
      }
    });

    /* ── Clear (both buttons) ── */
    function clearAll() {
      inputRich.innerHTML = "";
      inputHtml.value = "";
      output.classList.remove("has-result");
      outputHtml.textContent = "";
      preview.innerHTML = "";
      emptyState.style.display = "flex";
      showStatus("");
      updateCharCount("");
      if (currentMode === "richtext") inputRich.focus();
      else inputHtml.focus();
    }
    clearBtn.addEventListener("click", clearAll);
    clearInputBtn.addEventListener("click", clearAll);

    /* ── Sample ── */
    sampleBtn.addEventListener("click", loadSample);

    /* ── Mode toggle ── */
    for (var i = 0; i < inputTabs.length; i++) {
      inputTabs[i].addEventListener("click", function () {
        setMode(this.getAttribute("data-mode"));
      });
    }

    /* ── Paste handlers ── */
    inputRich.addEventListener("paste", handleRichPaste);
    inputHtml.addEventListener("paste", handleHtmlPaste);

    /* ── Keyboard: Ctrl+Enter ── */
    function keydownHandler(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        convertBtn.click();
      }
    }
    inputRich.addEventListener("keydown", keydownHandler);
    inputHtml.addEventListener("keydown", keydownHandler);

    /* ── Output tabs ── */
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].addEventListener("click", function () {
        activateTab(this.getAttribute("data-tab"));
      });
    }

    /* Start in Rich Text mode */
    setMode("richtext");
  }

  return { init: init, clean: clean, loadSample: loadSample, setMode: setMode };
})();
