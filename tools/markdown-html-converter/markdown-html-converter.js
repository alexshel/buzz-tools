/* markdown-html-converter.js — Markdown ↔ HTML (bidirectional).
 * All client-side; no data leaves the browser.
 *
 * Markdown → HTML (GFM subset):
 *   headings (ATX + setext), paragraphs, bold/italic/strikethrough,
 *   inline code, fenced code blocks with language class, indented code,
 *   blockquotes (incl. nested), ordered/unordered lists (incl. nested),
 *   links, images, autolinks (<url> + bare http(s)/www), thematic breaks.
 *   Raw HTML in Markdown is escaped (keeps the live preview injection-safe).
 *
 * HTML → Markdown: the semantic inverse — strips inline styles and
 *   presentational attributes, normalizes whitespace, and emits clean ATX
 *   headings, fenced code, reference-free links, nested lists, etc.
 *
 * Out of scope BY DESIGN (separate roadmap tools): tables, task lists,
 * footnotes, slides — kept out so this tool stays focused.
 */

var MarkdownHtmlConverter = (function () {
  "use strict";

  /* ── shared escaping ─────────────────────────────────────── */

  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ── URL safety: allow safe schemes only (no javascript:, vbscript:, …) ── */

  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    var scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(u);
    if (scheme) {
      var s = scheme[1].toLowerCase();
      if (s === "http" || s === "https" || s === "mailto" || s === "tel") return u;
      if (s === "data" && /^data:image\//i.test(u)) return u;
      return "";
    }
    return u; /* relative path or fragment */
  }

  /* ══════════════════ Markdown → HTML ══════════════════ */

  /* Inline placeholders. Nested inline() calls share ONE state so that tags
     built for links/images/code are opaque to later emphasis/escaping passes
     and get restored (recursively) at the end. */
  function newState() { return { map: Object.create(null), seq: 0 }; }
  function keep(state, value) {
    var k = "P" + (state.seq++);
    state.map[k] = value;
    return "\u0000" + k + "\u0000";
  }
  function restore(text, state) {
    return text.replace(/\u0000([A-Z]\d+)\u0000/g, function (m, k) {
      return state.map[k] != null ? state.map[k] : m;
    });
  }

  function protectCodeSpans(text, state) {
    return text.replace(/(`+)([\s\S]*?)\1/g, function (all, fence, inner) {
      if (inner.indexOf(fence) !== -1) return all; /* ambiguous run — leave raw */
      return keep(state, "<code>" + escHtml(inner.replace(/\n/g, " ")) + "</code>");
    });
  }

  var LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s<>]+)(?:[ \t]+(["'])([\s\S]*?)\4)?\)/g;

  function processLinksImages(text, state) {
    return text.replace(LINK_RE, function (all, bang, label, urlRaw, q, title) {
      var url = safeUrl(urlRaw);
      if (!url) return all; /* dangerous scheme — keep literal */
      if (bang) {
        var alt = stripTags(inlineWith(label, state)).replace(/"/g, "&quot;");
        var img = '<img src="' + escAttr(url) + '" alt="' + alt + '"';
        if (title) img += ' title="' + escAttr(title) + '"';
        img += ">";
        return keep(state, img);
      }
      var inner = inlineWith(label, state);
      var a = '<a href="' + escAttr(url) + '"';
      if (title) a += ' title="' + escAttr(title) + '"';
      a += ">" + inner + "</a>";
      return keep(state, a);
    });
  }

  function stripTags(s) { return String(s).replace(/<[^>]*>/g, ""); }

  function processAutolinks(text, state) {
    /* angle-bracket autolinks — run before HTML escaping */
    text = text.replace(/<((?:https?:\/\/|www\.)[^\s<>]+|mailto:[^\s<>]+)>/gi, function (all, u) {
      var href = /^www\./i.test(u) ? "http://" + u : u;
      var safe = safeUrl(href);
      if (!safe) return all;
      return keep(state, '<a href="' + escAttr(safe) + '">' + escHtml(u) + "</a>");
    });
    /* bare URLs (GFM) */
    text = text.replace(/((?:https?:\/\/|www\.)[^\s<>]+)/gi, function (all, u) {
      var body = u.replace(/[.,;:!?()]+$/, "");
      var tail = u.slice(body.length);
      var href = /^www\./i.test(body) ? "http://" + body : body;
      var safe = safeUrl(href);
      if (!safe) return all;
      return keep(state, '<a href="' + escAttr(safe) + '">' + escHtml(body) + "</a>") + tail;
    });
    return text;
  }

  function escapeOutside(text) {
    var out = "", last = 0, m;
    var re = /\u0000[^\u0000]+\u0000/g;
    while ((m = re.exec(text))) {
      out += escHtml(text.slice(last, m.index));
      out += m[0];
      last = m.index + m[0].length;
    }
    return out + escHtml(text.slice(last));
  }

  function applyEmphasis(text) {
    text = text.replace(/\*\*\*([^*\n]+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/___([^_\n]+?)___/g, "<strong><em>$1</em></strong>");
    text = text.replace(/(^|[^*])\*\*([^*\s\n][^*\n]*?)\*\*(?!\*)/g, "$1<strong>$2</strong>");
    text = text.replace(/(^|[^_])__([^_\s\n][^_\n]*?)__(?!_)/g, "$1<strong>$2</strong>");
    text = text.replace(/~~([^~\s\n][^~\n]*?)~~/g, "<del>$1</del>");
    text = text.replace(/(^|[^*])\*([^*\s\n][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>");
    text = text.replace(/(^|[^_])_([^_\s\n][^_\n]*?)_(?!_)/g, "$1<em>$2</em>");
    return text;
  }

  function inlineWith(text, state) {
    text = protectCodeSpans(text, state);
    text = processLinksImages(text, state);
    text = processAutolinks(text, state);
    text = escapeOutside(text);
    text = applyEmphasis(text);
    return restore(text, state);
  }

  function inline(text) {
    return inlineWith(String(text), newState());
  }

  /* ── block parsing ─────────────────────────────────────── */

  var LIST_RE = /^(\s*)([-+*]|\d{1,9}[.)])(\s+)(.*)$/;
  var FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*(\S+)?/;
  var FENCE_END_RE = /^\s*(`{3,}|~{3,})\s*$/;
  var HEAD_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
  var HR_RE = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/;
  var QUOTE_RE = /^ {0,3}>/;

  function leadSpaces(s) {
    var n = 0, i = 0;
    while (i < s.length && (s[i] === " " || s[i] === "\t")) {
      if (s[i] === " ") n++;
      else n += 4 - (n % 4);
      i++;
    }
    return n;
  }

  /* substring beginning at visual column `col` (tab stops every 4) */
  function sliceAtColumn(s, col) {
    var n = 0, i = 0;
    while (i < s.length && n < col && (s[i] === " " || s[i] === "\t")) {
      n += s[i] === "\t" ? 4 - (n % 4) : 1;
      i++;
    }
    return s.slice(i);
  }

  function parseBlocks(lines) {
    var out = [], i = 0, n = lines.length;
    while (i < n) {
      var line = lines[i];

      if (/^\s*$/.test(line)) { i++; continue; }

      /* fenced code */
      var fm = FENCE_RE.exec(line);
      if (fm) {
        i++;
        var code = [];
        while (i < n && !FENCE_END_RE.test(lines[i])) { code.push(lines[i]); i++; }
        if (i < n) i++; /* consume closing fence */
        var lang = fm[2] || "";
        var cls = /^[A-Za-z0-9_+.-]+$/.test(lang)
          ? ' class="language-' + lang + '"' : "";
        out.push("<pre><code" + cls + ">" + escHtml(code.join("\n")) + "</code></pre>");
        continue;
      }

      /* setext heading (=== / --- under a paragraph line) */
      if (i + 1 < n && !HEAD_RE.test(line) && leadSpaces(line) < 4 && !/^\s*$/.test(line)) {
        var under = lines[i + 1].trim();
        if (/^=+$/.test(under)) {
          out.push("<h1>" + inline(line.replace(/^ {0,3}/, "")) + "</h1>");
          i += 2;
          continue;
        }
        if (/^-{2,}$/.test(under) && !HR_RE.test(line)) {
          out.push("<h2>" + inline(line.replace(/^ {0,3}/, "")) + "</h2>");
          i += 2;
          continue;
        }
      }

      /* ATX heading */
      var h = HEAD_RE.exec(line);
      if (h) {
        var lvl = h[1].length;
        out.push("<h" + lvl + ">" + inline(h[2]) + "</h" + lvl + ">");
        i++;
        continue;
      }

      /* thematic break */
      if (HR_RE.test(line)) { out.push("<hr>"); i++; continue; }

      /* blockquote */
      if (QUOTE_RE.test(line)) {
        var qLines = [];
        while (i < n) {
          var ql = lines[i];
          if (QUOTE_RE.test(ql)) { qLines.push(ql.replace(/^ {0,3}>[ \t]?/, "")); i++; }
          else if (/^\s*$/.test(ql) && i + 1 < n && QUOTE_RE.test(lines[i + 1])) { qLines.push(""); i++; }
          else break;
        }
        out.push("<blockquote>\n" + parseBlocks(qLines).join("\n") + "\n</blockquote>");
        continue;
      }

      /* list (base indent must be < 4 or CommonMark treats it as code) */
      var lm = LIST_RE.exec(line);
      if (lm) {
        var base = leadSpaces(line);
        if (base < 4) {
          var list = parseList(lines, i, base);
          out.push(renderList(list));
          i = list.i;
          continue;
        }
      }

      /* indented code block */
      if (leadSpaces(line) >= 4) {
        var code2 = [];
        while (i < n) {
          var cl = lines[i];
          if (/^\s*$/.test(cl)) { code2.push(""); i++; continue; }
          if (leadSpaces(cl) < 4) break;
          code2.push(sliceAtColumn(cl, 4));
          i++;
        }
        while (code2.length && !code2[0].trim()) code2.shift();
        while (code2.length && !code2[code2.length - 1].trim()) code2.pop();
        if (code2.length) out.push("<pre><code>" + escHtml(code2.join("\n")) + "</code></pre>");
        continue;
      }

      /* paragraph (with look-ahead for block starts) */
      var para = [line];
      i++;
      while (i < n) {
        var p = lines[i];
        if (/^\s*$/.test(p)) break;
        if (HEAD_RE.test(p)) break;
        if (HR_RE.test(p)) break;
        if (QUOTE_RE.test(p)) break;
        if (FENCE_RE.test(p)) break;
        if (LIST_RE.test(p) && leadSpaces(p) < 4) break;
        if (leadSpaces(p) >= 4) break;
        if (/^=+$|^-+$/.test(p.trim())) break;
        para.push(p);
        i++;
      }
      out.push("<p>" + inline(para.join(" ")) + "</p>");
    }
    return out;
  }

  function parseList(lines, i, base) {
    var items = [];
    while (i < lines.length) {
      var m = LIST_RE.exec(lines[i]);
      if (!m) break;
      var ind = leadSpaces(lines[i]);
      if (ind !== base) break;
      var marker = m[2];
      var ordered = /^\d/.test(marker);
      var contentCol = base + marker.length + 1;
      var text = m[4];
      i++;
      var sub = [text];
      var sawBlank = false;
      while (i < lines.length) {
        var l = lines[i];
        var lm = LIST_RE.exec(l);
        var lind = leadSpaces(l);
        if (lm && lind <= base) break;        /* next top-level item */
        if (/^\s*$/.test(l)) {
          var j = i;
          while (j < lines.length && /^\s*$/.test(lines[j])) j++;
          if (j < lines.length && leadSpaces(lines[j]) > base) {
            for (var k = i; k < j; k++) sub.push("");
            sawBlank = true;
            i = j;
            continue;
          }
          break;                               /* blank ends the item */
        }
        if (lind >= contentCol) { sub.push(sliceAtColumn(l, contentCol)); i++; }
        else break;
      }
      var bodyHtml = parseBlocks(sub).join("\n");
      items.push({ ordered: ordered, marker: marker, body: bodyHtml, sawBlank: sawBlank });
    }
    return { items: items, i: i };
  }

  function renderList(list) {
    var first = list.items[0];
    if (!first) return "";
    var tag = first.ordered ? "ol" : "ul";
    var html = "<" + tag + ">\n";
    for (var idx = 0; idx < list.items.length; idx++) {
      var it = list.items[idx];
      var body = it.body;
      var sp = /^<p>([\s\S]*)<\/p>$/.exec(body);
      if (!body) {
        html += "<li></li>\n";
      } else if (sp && !it.sawBlank) {
        html += "<li>" + sp[1] + "</li>\n";
      } else {
        html += "<li>\n" + indentBlocks(body, 2) + "\n</li>\n";
      }
    }
    return html + "</" + tag + ">";
  }

  function indentBlocks(html, col) {
    var pad = new Array(col + 1).join(" ");
    return html.split("\n").map(function (line) {
      return line ? pad + line : line;
    }).join("\n");
  }

  function mdToHtml(src) {
    src = String(src || "").replace(/\r\n?/g, "\n");
    var blocks = parseBlocks(src.split("\n"));
    return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ══════════════════ HTML → Markdown ══════════════════ */

  var INLINE_TAGS = {
    a: 1, img: 1, strong: 1, b: 1, em: 1, i: 1, del: 1, s: 1, strike: 1,
    code: 1, span: 1, br: 1, sub: 1, sup: 1, u: 1, mark: 1, small: 1,
    big: 1, abbr: 1, label: 1, cite: 1, kbd: 1, q: 1, time: 1
  };

  var STRIP_ATTRS = ["style", "class", "id", "align", "valign", "bgcolor",
    "border", "cellpadding", "cellspacing", "width", "height", "face",
    "color", "size", "nowrap", "shape", "coords", "vspace", "hspace",
    "background", "cell", "frameborder", "scrolling"];

  function stripPresentational(root) {
    var all = Array.prototype.slice.call(root.querySelectorAll("*"));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var attrs = Array.prototype.slice.call(el.attributes || []);
      for (var j = 0; j < attrs.length; j++) {
        var name = attrs[j].name;
        /* keep the semantic language-* class on <code> so fenced blocks round-trip */
        if (name === "class" && el.tagName.toLowerCase() === "code") {
          var lm = /(?:^|\s)language-([A-Za-z0-9_+-]+)/.exec(attrs[j].value);
          if (lm) { el.setAttribute("class", "language-" + lm[1]); continue; }
        }
        if (STRIP_ATTRS.indexOf(name) !== -1) el.removeAttribute(name);
      }
    }
  }

  function escapeMdText(t) {
    return String(t)
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\*/g, "\\*")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function textMd(t) {
    return escapeMdText(
      t.replace(/\u00a0/g, " ").replace(/\s+/g, " ")
    );
  }

  function escapeLineStart(s) {
    return s.split("\n").map(function (line) {
      if (/^(#{1,6}[ \t]|>[ \t]?|[-+*][ \t]+\S|\d{1,9}[.)][ \t]+\S|={2,}|-{3,}|\*{3,}|_{3,})/.test(line)) {
        return "\\" + line;
      }
      return line;
    }).join("\n");
  }

  function paraMd(s) {
    var text = String(s).replace(/([^\n])\n/g, "$1  \n");
    return escapeLineStart(text);
  }

  function inlineMd(el) {
    var out = "";
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) out += textMd(n.data);
      else if (n.nodeType === 1) out += renderInline(n);
    }
    return out;
  }

  function renderInline(el) {
    var tag = el.tagName.toLowerCase();
    var str = inlineMd(el);
    switch (tag) {
      case "strong": case "b": return "**" + str + "**";
      case "em": case "i": return "*" + str + "*";
      case "del": case "s": case "strike": return "~~" + str + "~~";
      case "code": {
        var c = el.textContent.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
        return c.indexOf("`") !== -1 ? "``" + c + "``" : "`" + c + "`";
      }
      case "a": {
        var href = (el.getAttribute("href") || "").trim();
        var safe = href ? safeUrl(href) : "";
        if (!safe) return str;
        var title = el.getAttribute("title")
          ? ' "' + el.getAttribute("title").replace(/"/g, '\\"') + '"' : "";
        var urlOut = /[\s()]/.test(safe) ? "<" + safe + ">" : safe;
        if (str === safe && /^(https?:\/\/|mailto:)/.test(safe)) return "<" + safe + ">";
        return "[" + str + "](" + urlOut + title + ")";
      }
      case "img": {
        var src = safeUrl(el.getAttribute("src") || "");
        if (!src) return "";
        var alt = (el.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
        var ititle = el.getAttribute("title")
          ? ' "' + el.getAttribute("title").replace(/"/g, '\\"') + '"' : "";
        return "![" + escapeMdText(alt) + "](" + src + ititle + ")";
      }
      case "br": return "\n";
      default: return str; /* span, u, small, sub, sup, mark, abbr, kbd, cite, … transparent */
    }
  }

  function indentText(text, col) {
    if (!col || !text) return text;
    var pad = new Array(col + 1).join(" ");
    return text.split("\n").map(function (l) { return l ? pad + l : l; }).join("\n");
  }

  function serializeBlocks(container, indent) {
    var blocks = [], pending = "";
    var nodes = container.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.nodeType === 3) { pending += textMd(node.data); continue; }
      if (node.nodeType !== 1) continue;
      var tag = node.tagName.toLowerCase();
      if (INLINE_TAGS[tag]) { pending += renderInline(node); continue; }
      if (pending.trim()) { blocks.push(paraMd(pending)); pending = ""; }
      var b = renderBlock(node, indent);
      if (b) blocks.push(b);
    }
    if (pending.trim()) blocks.push(paraMd(pending));
    return blocks;
  }

  function renderBlock(el, indent) {
    var tag = el.tagName.toLowerCase();
    switch (tag) {
      case "p": return paraMd(inlineMd(el));
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        var n = parseInt(tag[1], 10);
        var hashes = new Array(n + 1).join("#");
        return hashes + " " + inlineMd(el);
      }
      case "pre": return fenceCodeMd(el, indent);
      case "blockquote": return quoteMd(el, indent);
      case "ul": case "ol": return listMd(el, indent);
      case "table": return tableMd(el);
      case "hr": return "---";
      case "script": case "style": case "iframe": case "noscript":
      case "link": case "meta": case "object": case "embed":
      case "form": case "input": case "button": case "select": case "textarea":
        return "";
      default:
        /* transparent block containers (div, section, article, main, …) */
        return serializeBlocks(el, indent).join("\n\n");
    }
  }

  function fenceCodeMd(el, indent) {
    var codeEl = el.querySelector("code");
    var text = (codeEl ? codeEl.textContent : el.textContent).replace(/\r\n?/g, "\n");
    var lang = "";
    if (codeEl) {
      var cls = codeEl.getAttribute("class") || "";
      var m = /(?:^|\s)language-([A-Za-z0-9_+-]+)/.exec(cls);
      if (m) lang = m[1];
    }
    text = text.replace(/^\n+/, "").replace(/\n+$/, "");
    var longest = 3;
    (text.match(/`+/g) || []).forEach(function (run) { if (run.length >= longest) longest = run.length + 1; });
    var fence = new Array(longest + 1).join("`");
    return indentText(fence + (lang || "") + "\n" + text + "\n" + fence, indent);
  }

  function quoteMd(el, indent) {
    var text = serializeBlocks(el, indent).join("\n\n");
    var pad = new Array((indent || 0) + 1).join(" ");
    return text.split("\n").map(function (l) {
      return pad + "> " + l;
    }).join("\n");
  }

  function listMd(el, indent) {
    var ordered = el.tagName.toLowerCase() === "ol";
    var start = parseInt(el.getAttribute("start"), 10);
    if (!(start >= 1)) start = 1;
    var num = start;
    var pad = new Array((indent || 0) + 1).join(" ");
    var lines = [];
    var items = el.children;
    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      if (li.tagName.toLowerCase() !== "li") continue;
      var marker = ordered ? num + ". " : "- ";
      num++;
      var contentCol = (indent || 0) + marker.length;
      var parts = liParts(li, contentCol);
      var firstInline = parts.length && parts[0].type === "inline";
      var line = pad + marker + (firstInline ? parts[0].text : "");
      for (var j = firstInline ? 1 : 0; j < parts.length; j++) {
        line += "\n" + parts[j].text;
      }
      line = line.replace(/[ \t]+$/, "");
      lines.push(line);
    }
    return lines.join("\n");
  }

  function liParts(li, contentCol) {
    var parts = [], acc = [];
    function flush() { if (acc.length) { parts.push({ type: "inline", text: acc.join("") }); acc = []; } }
    var nodes = li.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { var t = textMd(n.data); if (t) acc.push(t); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        flush();
        parts.push({ type: "block", text: listMd(n, contentCol) });
      } else if (tag === "blockquote" || tag === "pre" || tag === "table") {
        flush();
        parts.push({ type: "block", text: renderBlock(n, contentCol) });
      } else if (tag === "div" || tag === "p" || tag === "section" || tag === "article") {
        flush();
        parts.push({ type: "block", text: indentText(serializeBlocks(n, contentCol).join("\n\n"), contentCol) });
      } else {
        acc.push(renderInline(n));
      }
    }
    flush();
    return parts;
  }

  function tableMd(el) {
    var lines = [];
    var rows = el.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll("th, td");
      var row = [];
      for (var j = 0; j < cells.length; j++) {
        row.push((cells[j].textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim());
      }
      if (row.join(" | ").trim()) lines.push(row.join(" | "));
    }
    return lines.join("\n");
  }

  function htmlToMd(html) {
    html = String(html || "").replace(/\r\n?/g, "\n");
    if (!/<[a-zA-Z][^>]*>/.test(html)) {
      return escapeMdText(html.replace(/[ \t\r\n]+/g, " ").trim());
    }
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch (e) {
      return escapeMdText(html.trim());
    }
    var body = doc.body;
    stripPresentational(body);
    var blocks = serializeBlocks(body, 0);
    var out = blocks.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return out.trim() + "\n";
  }

  /* ══════════════════ UI ══════════════════ */

  var SAMPLE_MD =
    "# Markdown \u2194 HTML Converter\n" +
    "\n" +
    "A **bidirectional** converter: paste *Markdown* and get semantic HTML, or do it in reverse. Everything runs in your browser.\n" +
    "\n" +
    "## What it supports\n" +
    "\n" +
    "- Headings (H1\u2013H6)\n" +
    "- Bold, *italic*, and ~~strikethrough~~\n" +
    "- `inline code` and fenced code blocks\n" +
    "- [Links](https://example.com) and images\n" +
    "- Blockquotes, nested lists, and horizontal rules (---)\n" +
    "\n" +
    "### A fenced code block\n" +
    "\n" +
    "```js\n" +
    "function greet(name) {\n" +
    '  return "Hello, " + name;\n' +
    "}\n" +
    "```\n" +
    "\n" +
    "> Everything runs in your browser \u2014 no data leaves your machine.\n";

  var SAMPLE_HTML =
    "<h1>Markdown \u2194 HTML Converter</h1>\n" +
    "<p>A <strong>bidirectional</strong> converter: paste <em>Markdown</em> and get semantic HTML, or do it in reverse.</p>\n" +
    "<h2>What it supports</h2>\n" +
    "<ul>\n" +
    "  <li>Headings (H1\u2013H6)</li>\n" +
    "  <li>Bold, <em>italic</em>, and <del>strikethrough</del></li>\n" +
    "  <li><code>inline code</code> and fenced code blocks</li>\n" +
    "  <li><a href=\"https://example.com\">Links</a> and images</li>\n" +
    "  <li>Blockquotes, nested lists, and horizontal rules</li>\n" +
    "</ul>\n" +
    "<h3>A fenced code block</h3>\n" +
    "<pre><code class=\"language-js\">function greet(name) {\n" +
    '  return "Hello, " + name;\n' +
    "}</code></pre>\n" +
    "<blockquote><p>Everything runs in your browser \u2014 no data leaves your machine.</p></blockquote>\n";

  function init(doc) {
    doc = doc || document;
    var input = doc.getElementById("input");
    var inputCharCount = doc.getElementById("input-char-count");
    var output = doc.getElementById("output");
    var outputSource = doc.getElementById("output-source");
    var outputPreview = doc.getElementById("output-preview");
    var outputCharCount = doc.getElementById("output-char-count");
    var outputLineCount = doc.getElementById("output-line-count");
    var convertBtn = doc.getElementById("convert-btn");
    var copyBtn = doc.getElementById("copy-btn");
    var clearBtn = doc.getElementById("clear-btn");
    var sampleBtn = doc.getElementById("sample-btn");
    var status = doc.getElementById("status");
    var inputTabs = Array.prototype.slice.call(doc.querySelectorAll(".input-tab"));
    var outputTabs = Array.prototype.slice.call(doc.querySelectorAll("#output .tab"));

    var mode = "md>html";

    function setStatus(msg, isError) {
      status.textContent = msg || "";
      status.style.color = isError ? "#dc2626" : "";
    }

    function showEmpty() {
      output.classList.remove("has-output");
      outputSource.textContent = "";
      outputPreview.innerHTML = "";
      outputCharCount.textContent = "0";
      outputLineCount.textContent = "0";
      syncPanels();
    }

    function convert() {
      var value = input.value;
      inputCharCount.textContent = value.length.toLocaleString();
      var source = "", preview = "", empty = true;
      try {
        if (value.trim()) {
          source = mode === "md>html" ? mdToHtml(value) : htmlToMd(value);
          preview = mode === "md>html" ? source : mdToHtml(source);
          empty = false;
        }
      } catch (e) {
        setStatus("Error: " + (e && e.message ? e.message : e), true);
        return;
      }
      if (empty) { showEmpty(); setStatus(""); return; }
      outputSource.textContent = source;
      outputPreview.innerHTML = preview;
      outputCharCount.textContent = source.length.toLocaleString();
      outputLineCount.textContent = source.split("\n").length.toLocaleString();
      output.classList.add("has-output");
      setStatus(mode === "md>html" ? "Converted Markdown to HTML" : "Converted HTML to Markdown");
    }

    /* keep output panels' visibility tied to the active tab */
    function syncPanels() {
      var prev = false;
      for (var i = 0; i < outputTabs.length; i++) {
        if (outputTabs[i].classList.contains("active") && outputTabs[i].getAttribute("data-tab") === "preview") prev = true;
      }
      outputSource.hidden = prev;
      outputPreview.hidden = !prev;
    }

    function setPlaceholder() {
      input.placeholder = mode === "md>html"
        ? "# Heading\n\nType or paste **Markdown** here — then click Convert to turn it into HTML."
        : "<h1>Heading</h1>\n\nType or paste <strong>HTML</strong> here — then click Convert to turn it into Markdown.";
    }

    function setMode(m) {
      mode = m;
      for (var i = 0; i < inputTabs.length; i++) {
        var isOn = inputTabs[i].getAttribute("data-mode") === m;
        inputTabs[i].classList.toggle("active", isOn);
        inputTabs[i].setAttribute("aria-selected", isOn ? "true" : "false");
      }
      setPlaceholder();
    }

    function fallbackCopy(text) {
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      doc.body.appendChild(ta);
      ta.select();
      try { doc.execCommand("copy"); } catch (e) {}
      doc.body.removeChild(ta);
    }

    function copyOutput() {
      var text = outputSource.textContent;
      if (!text) { setStatus("Nothing to copy yet.", true); return; }
      function done() {
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = "Copy output"; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else {
        fallbackCopy(text);
        done();
      }
    }

    /* conversion is manual — only runs on Convert (or Ctrl/Cmd+Enter) */
    convertBtn.addEventListener("click", convert);
    input.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        convert();
      }
    });
    /* input char count updates as you type; conversion does not */
    input.addEventListener("input", function () {
      inputCharCount.textContent = input.value.length.toLocaleString();
    });

    for (var i = 0; i < inputTabs.length; i++) {
      inputTabs[i].addEventListener("click", function () {
        setMode(this.getAttribute("data-mode"));
      });
    }
    for (var j = 0; j < outputTabs.length; j++) {
      outputTabs[j].addEventListener("click", function () {
        for (var k = 0; k < outputTabs.length; k++) {
          var on = outputTabs[k] === this;
          outputTabs[k].classList.toggle("active", on);
          outputTabs[k].setAttribute("aria-selected", on ? "true" : "false");
        }
        syncPanels();
      });
    }

    clearBtn.addEventListener("click", function () {
      input.value = "";
      showEmpty();
      setStatus("");
      input.focus();
    });

    sampleBtn.addEventListener("click", function () {
      input.value = mode === "md>html" ? SAMPLE_MD : SAMPLE_HTML;
      inputCharCount.textContent = input.value.length.toLocaleString();
      showEmpty();
      setStatus("Sample loaded — click Convert to see the result.");
    });

    copyBtn.addEventListener("click", copyOutput);

    setMode("md>html");
    showEmpty();
    setStatus("");
  }

  return { init: init, mdToHtml: mdToHtml, htmlToMd: htmlToMd };
})();
