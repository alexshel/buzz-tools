/*
 * portal.js — shared shell for Buzz Tools.
 *
 * Renders the portal header (site title + dynamic nav from tools.json) into
 * #site-header, the tool-card grid into #tool-grid (portal home), and the
 * footer into #site-footer. Include it on ANY page with:
 *
 *   <header id="site-header"></header>
 *   <script src="../../portal.js"></script>   <!-- root: "portal.js", tools: "../../portal.js" -->
 *
 * New tools need no JavaScript changes: add a folder under tools/ plus one
 * entry in tools.json and the header/nav/grid update everywhere.
 */
(function () {
  "use strict";

  /* The shell lives at the portal root. Derive that root from our own <script>
     src so nested tool pages (deep links, future nesting) need zero config. */
  function selfRoot() {
    const scripts = document.querySelectorAll('script[src$="portal.js"]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute("src") || "";
      const idx = src.lastIndexOf("portal.js");
      if (idx !== -1 && src.slice(idx) === "portal.js") return src.slice(0, idx);
    }
    return "./";
  }

  const root = selfRoot();
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  const grid = document.getElementById("tool-grid");

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* Group tools by category, preserving order of first appearance. */
  function groupByCategory(tools) {
    var groups = [];
    var seen = Object.create(null);
    for (var i = 0; i < tools.length; i++) {
      var t = tools[i];
      var cat = t.category || "Other";
      if (!seen[cat]) {
        seen[cat] = true;
        groups.push({ name: cat, tools: [] });
      }
      groups[groups.length - 1].tools.push(t);
    }
    return groups;
  }

  /* is this tool the page we're on? (normalize trailing slashes) */
  function isCurrent(href) {
    try {
      const target = new URL(href, location.href).pathname.replace(/\/+$/, "");
      const here = location.pathname.replace(/\/+$/, "");
      return target !== "" && target === here;
    } catch (e) { return false; }
  }

  function renderHeader(manifest) {
    if (!header) return;
    header.classList.add("site-header");
    const inner = el("div", "site-header-inner");

    const title = el("a", "site-title", manifest.name);
    title.href = root || "./";
    title.setAttribute("aria-label", manifest.name + " — portal home");
    inner.appendChild(title);

    const nav = el("nav", "site-nav");
    nav.setAttribute("aria-label", "Tools");
    var groups = groupByCategory(manifest.tools);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      if (g > 0) {
        nav.appendChild(el("span", "nav-sep"));
      }
      var catLabel = el("span", "nav-category", group.name);
      nav.appendChild(catLabel);
      for (var i = 0; i < group.tools.length; i++) {
        var tool = group.tools[i];
        var href = root + "tools/" + tool.slug + "/";
        var link = el("a", "nav-link", tool.name);
        link.href = href;
        if (isCurrent(href)) link.classList.add("active");
        nav.appendChild(link);
      }
    }
    inner.appendChild(nav);

    /* hamburger button (visible only on mobile via CSS) */
    var ham = el("button", "hamburger");
    ham.setAttribute("aria-label", "Toggle tools menu");
    ham.setAttribute("aria-expanded", "false");
    ham.appendChild(el("span", "hamburger-line"));
    ham.appendChild(el("span", "hamburger-line"));
    ham.appendChild(el("span", "hamburger-line"));
    ham.addEventListener("click", function (e) {
      e.stopPropagation();
      nav.classList.toggle("open");
      ham.classList.toggle("open");
      var expanded = nav.classList.contains("open") ? "true" : "false";
      ham.setAttribute("aria-expanded", expanded);
    });
    /* close nav when a link is clicked */
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        ham.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
      }
    });
    /* close nav when clicking outside */
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !inner.contains(e.target)) {
        nav.classList.remove("open");
        ham.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
      }
    });
    inner.appendChild(ham);

    header.appendChild(inner);
  }

  function renderGrid(manifest) {
    if (!grid) return;
    var groups = groupByCategory(manifest.tools);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var section = el("div", "category-section");
      var heading = el("h2", "category-heading", group.name);
      section.appendChild(heading);
      var subgrid = el("div", "category-grid");
      for (var i = 0; i < group.tools.length; i++) {
        var tool = group.tools[i];
        var card = el("a", "tool-card");
        card.href = root + "tools/" + tool.slug + "/";
        card.appendChild(el("span", "tool-icon", tool.icon || "\uD83E\uDDF0"));
        card.appendChild(el("h2", "tool-name", tool.name));
        card.appendChild(el("p", "tool-desc", tool.description));
        card.appendChild(el("span", "tool-go", "Open tool \u2192"));
        subgrid.appendChild(card);
      }
      section.appendChild(subgrid);
      grid.appendChild(section);
    }
  }

  function renderFooter(manifest) {
    if (!footer) return;
    footer.classList.add("site-footer");
    const n = manifest.tools.length;
    footer.textContent = manifest.name + " \u00B7 " + n + (n === 1 ? " tool" : " tools")
      + " \u00B7 all data stays in your browser";
  }

  fetch(root + "tools.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (manifest) {
      renderHeader(manifest);
      renderGrid(manifest);
      renderFooter(manifest);
    })
    .catch(function (err) {
      /* Keep the shell usable even if tools.json can't load. */
      if (header) {
        header.classList.add("site-header");
        const inner = el("div", "site-header-inner");
        const title = el("a", "site-title", "Tools");
        title.href = root || "./";
        inner.appendChild(title);
        header.appendChild(inner);
      }
      console.error("portal.js: failed to load " + root + "tools.json — " + err.message);
    });
})();
