/*
 * portal.js — shared shell for Buzz Tools.
 *
 * Loads tools.json (tool manifest) plus portal.config.json (categories,
 * navigation, search, homepage) and renders into:
 *   #site-header  → title + config-driven nav (desktop mega-menu, mobile drawer)
 *   #tool-grid    → category-grouped tool cards (portal home)
 *   #site-footer  → tool count
 * Include it on ANY page with:
 *
 *   <header id="site-header"></header>
 *   <script src="../../portal.js"></script>   <!-- root: "portal.js", tools: "../../portal.js" -->
 *
 * New tools need no JS changes: add a folder under tools/ plus one entry in
 * tools.json. If portal.config.json is missing/partial the shell falls back to
 * legacy behaviour (categories grouped by display name, order of first
 * appearance) so the portal keeps working as before.
 */
(function () {
  "use strict";

  /* Statuses that count as "shippable". planned/deprecated stay out of the
     nav, grid, footer count and search until they became live. */
  var VISIBLE = { live: true, building: true };

  /* The shell lives at the portal root. Derive that root from our own <script>
     src so nested tool pages (deep links, future nesting) need zero config. */
  function selfRoot() {
    var scripts = document.querySelectorAll('script[src$="portal.js"]');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      var idx = src.lastIndexOf("portal.js");
      if (idx !== -1 && src.slice(idx) === "portal.js") return src.slice(0, idx);
    }
    return "./";
  }

  var root = selfRoot();
  var header = document.getElementById("site-header");
  var footer = document.getElementById("site-footer");
  var grid = document.getElementById("tool-grid");

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  /* ---- config / category layer ---- */

  /* Index config categories by id and by display name, so both new (id) and
     legacy (display name) tool.category values resolve. */
  function indexCategories(config) {
    var idx = { byId: Object.create(null), byName: Object.create(null), config: config };
    var cats = config && Array.isArray(config.categories) ? config.categories : [];
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (!c || !c.id) continue;
      idx.byId[c.id] = c;
      if (c.name) idx.byName[c.name] = c.id;
    }
    return idx;
  }

  function categoryIdOf(tool, idx) {
    var cat = tool.category;
    if (!cat) return null;
    if (idx.byId[cat]) return cat;          // already an id
    if (idx.byName[cat]) return idx.byName[cat]; // legacy display name
    return null;
  }

  function isVisible(tool) {
    return !!VISIBLE[tool && tool.status ? tool.status : "live"];
  }

  /* Group visible tools by category in config order. Categories with no
     visible tools are omitted. With no usable config, fall back to legacy
     grouping (order of first appearance). */
  function groupTools(tools, idx) {
    var visible = tools.filter(isVisible);
    var groups = [];
    var i, j, cat, bucket, t;

    if (idx.config && Array.isArray(idx.config.categories) && idx.config.categories.length) {
      for (i = 0; i < idx.config.categories.length; i++) {
        cat = idx.config.categories[i];
        bucket = [];
        for (j = 0; j < visible.length; j++) {
          if (categoryIdOf(visible[j], idx) === cat.id) bucket.push(visible[j]);
        }
        if (bucket.length) {
          groups.push({ id: cat.id, name: cat.name || cat.id, color: cat.color || null, tools: bucket });
        }
      }
      var rest = [];
      for (j = 0; j < visible.length; j++) {
        if (!categoryIdOf(visible[j], idx)) rest.push(visible[j]);
      }
      if (rest.length) groups.push({ id: null, name: "Other", color: null, tools: rest });
    } else {
      var seen = Object.create(null);
      for (j = 0; j < visible.length; j++) {
        t = visible[j];
        var name = t.category || "Other";
        if (!seen[name]) {
          seen[name] = true;
          groups.push({ id: null, name: name, color: null, tools: [] });
        }
        groups[groups.length - 1].tools.push(t);
      }
    }
    return groups;
  }

  /* A reusable "colored dot + label + optional count" trigger helper. */
  function buildLabel(name, count, color, showCount) {
    var wrap = el("span", "cat-label");
    var dot = el("span", "cat-dot");
    if (color) dot.style.backgroundColor = color;
    wrap.appendChild(dot);
    wrap.appendChild(document.createTextNode(name));
    if (showCount && count > 0) {
      wrap.appendChild(el("span", "mega-count", String(count)));
    }
    return wrap;
  }

  /* ---- header ---- */

  function renderHeader(manifest, groups, config) {
    if (!header) return;
    header.classList.add("site-header");
    var showCounts = !(config && config.navigation && config.navigation.showCategoryCounts === false);
    var inner = el("div", "site-header-inner");

    var title = el("a", "site-title", manifest.name);
    title.href = root || "./";
    title.setAttribute("aria-label", manifest.name + " — portal home");
    inner.appendChild(title);

    /* ---- desktop mega-menu nav ---- */
    var nav = el("nav", "site-nav-mega");
    nav.setAttribute("aria-label", "Tools");
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var item = el("div", "mega-item");
      var trigger = el("button", "mega-trigger");
      trigger.appendChild(buildLabel(group.name, group.tools.length, group.color, showCounts));

      var dropdown = el("div", "mega-dropdown");
      for (var i = 0; i < group.tools.length; i++) {
        var tool = group.tools[i];
        var href = root + "tools/" + tool.slug + "/";
        var link = el("a", "mega-link", tool.name);
        link.href = href;
        if (isCurrent(href)) link.classList.add("active");
        dropdown.appendChild(link);
      }

      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var clickedItem = this.closest(".mega-item");
        var isOpen = clickedItem.classList.contains("open");

        /* close all other mega-items */
        var allItems = nav.querySelectorAll(".mega-item");
        for (var k = 0; k < allItems.length; k++) {
          allItems[k].classList.remove("open");
        }

        /* toggle this one */
        if (!isOpen) clickedItem.classList.add("open");
      });

      /* on hover: close any click-pinned open items so only the hovered item's
         dropdown shows (via the CSS hover rule). */
      item.addEventListener("mouseenter", function () {
        var allItems = this.parentNode.querySelectorAll(".mega-item");
        for (var k = 0; k < allItems.length; k++) {
          allItems[k].classList.remove("open");
        }
      });

      item.appendChild(trigger);
      item.appendChild(dropdown);
      nav.appendChild(item);
    }
    inner.appendChild(nav);

    /* ---- hamburger + mobile drawer ---- */
    var ham = el("button", "hamburger");
    ham.setAttribute("aria-label", "Toggle tools menu");
    ham.setAttribute("aria-expanded", "false");
    ham.appendChild(el("span", "hamburger-line"));
    ham.appendChild(el("span", "hamburger-line"));
    ham.appendChild(el("span", "hamburger-line"));

    var mobileNav = el("nav", "site-nav-mobile");
    mobileNav.setAttribute("aria-label", "Tools (mobile)");
    for (var m = 0; m < groups.length; m++) {
      var mgroup = groups[m];
      var cat = el("div", "mobile-category");
      var mobTrigger = el("button", "mobile-trigger");
      mobTrigger.appendChild(buildLabel(mgroup.name, mgroup.tools.length, mgroup.color, showCounts));

      var mobDropdown = el("div", "mobile-dropdown");
      for (var n = 0; n < mgroup.tools.length; n++) {
        var mtool = mgroup.tools[n];
        var mhref = root + "tools/" + mtool.slug + "/";
        var mlink = el("a", "mobile-link", mtool.name);
        mlink.href = mhref;
        if (isCurrent(mhref)) {
          mlink.classList.add("active");
          cat.classList.add("open");
          mobTrigger.classList.add("open");
        }
        mobDropdown.appendChild(mlink);
      }

      mobTrigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var pcat = this.parentNode;
        pcat.classList.toggle("open");
        this.classList.toggle("open");
      });

      cat.appendChild(mobTrigger);
      cat.appendChild(mobDropdown);
      mobileNav.appendChild(cat);
    }

    /* hamburger toggle */
    ham.addEventListener("click", function (e) {
      e.stopPropagation();
      mobileNav.classList.toggle("open");
      ham.classList.toggle("open");
      var expanded = mobileNav.classList.contains("open") ? "true" : "false";
      ham.setAttribute("aria-expanded", expanded);
    });

    /* close mobile nav when a link is clicked */
    mobileNav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        mobileNav.classList.remove("open");
        ham.classList.remove("open");
        ham.setAttribute("aria-expanded", "false");
      }
    });

    /* close everything when clicking outside the header */
    document.addEventListener("click", function (e) {
      if (!inner.contains(e.target)) {
        var openItems = nav.querySelectorAll(".mega-item.open");
        for (var k = 0; k < openItems.length; k++) openItems[k].classList.remove("open");
        if (mobileNav.classList.contains("open")) {
          mobileNav.classList.remove("open");
          ham.classList.remove("open");
          ham.setAttribute("aria-expanded", "false");
        }
      }
    });

    inner.appendChild(ham);
    inner.appendChild(mobileNav);
    header.innerHTML = "";
    header.appendChild(inner);
  }

  /* ---- home grid ---- */

  function renderGrid(groups) {
    if (!grid) return;
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var section = el("div", "category-section");
      if (group.color) section.style.setProperty("--cat-color", group.color);
      section.appendChild(el("h2", "category-heading", group.name));
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

  function renderFooter(groups) {
    if (!footer) return;
    footer.classList.add("site-footer");
    var n = 0;
    for (var i = 0; i < groups.length; i++) n += groups[i].tools.length;
    footer.textContent = "Buzz Tools \u00B7 " + n + (n === 1 ? " tool" : " tools")
      + " \u00B7 all data stays in your browser";
  }

  /* ---- search (Fuse.js, vendored; degradates to substring matching) ---- */

  function setupSearch(config, groups) {
    if (!config || !config.search || config.search.enabled === false) return;
    var inner = header && header.querySelector(".site-header-inner");
    if (!inner) return;

    var min = config.search.minQueryLength || 2;
    var max = config.search.maxResults || 20;
    var fields = Array.isArray(config.search.indexFields) && config.search.indexFields.length
      ? config.search.indexFields
      : ["name", "description", "tags", "category"];

    /* flatten visible tools into searchable records with a readable category */
    var records = [];
    for (var g = 0; g < groups.length; g++) {
      for (var i = 0; i < groups[g].tools.length; i++) {
        var tool = groups[g].tools[i];
        records.push({
          slug: tool.slug,
          name: tool.name,
          description: tool.description,
          tags: tool.tags || [],
          category: groups[g].name,
          icon: tool.icon || ""
        });
      }
    }
    if (!records.length) return;

    var wrap = el("div", "portal-search");
    wrap.setAttribute("role", "search");
    var input = el("input", "portal-search-input");
    input.type = "search";
    input.placeholder = "Search tools\u2026";
    input.setAttribute("aria-label", "Search tools");
    input.setAttribute("autocomplete", "off");
    var results = el("ul", "portal-search-results");
    results.hidden = true;
    wrap.appendChild(input);
    wrap.appendChild(results);

    /* insert search right after the site title, before the nav */
    inner.insertBefore(wrap, inner.children[1] || null);

    /* Fuse.js is injected lazily (it's async); construct the index the first
       time we actually have something to search, so the substring fallback
       below kicks in seamlessly until/if the lib arrives. */
    var fuse = null;
    function ensureFuse() {
      if (!fuse && window.Fuse) {
        fuse = new window.Fuse(records, {
          keys: fields,
          threshold: 0.2,
          ignoreLocation: true,
          minMatchCharLength: 1
        });
      }
      return fuse;
    }

    function search(q) {
      if (typeof q !== "string" || q.trim().length < min) return [];
      var needle = q.trim().toLowerCase();
      var f = ensureFuse();
      if (f) return f.search(needle).slice(0, max).map(function (r) { return r.item; });
      /* fallback: substring match across the same fields */
      var out = [];
      for (var i = 0; i < records.length && out.length < max; i++) {
        var r = records[i];
        var hay = [r.name, r.description, (r.tags || []).join(" "), r.category].join(" ").toLowerCase();
        if (hay.indexOf(needle) !== -1) out.push(r);
      }
      return out;
    }

    function clear() {
      results.hidden = true;
      results.innerHTML = "";
    }

    function show(hits) {
      results.innerHTML = "";
      if (!hits.length) {
        var empty = el("li", "portal-search-empty", "No tools matching \"" + input.value.trim() + "\"");
        results.appendChild(empty);
      } else {
        for (var i = 0; i < hits.length; i++) {
          var h = hits[i];
          var li = el("li", "portal-search-hit");
          var a = el("a", "portal-search-result");
          a.href = root + "tools/" + h.slug + "/";
          var row = el("span", "hit-row");
          row.appendChild(el("span", "hit-icon", h.icon || "\uD83E\uDDF0"));
          var meta = el("span", "hit-meta");
          meta.appendChild(el("span", "hit-name", h.name));
          meta.appendChild(el("span", "hit-cat", h.category + (h.tags && h.tags.length ? " \u00B7 " + h.tags.slice(0, 3).join(", ") : "")));
          row.appendChild(meta);
          a.appendChild(row);
          li.appendChild(a);
          results.appendChild(li);
        }
      }
      results.hidden = false;
    }

    input.addEventListener("input", function () {
      var q = input.value;
      if (q.trim().length < min) return clear();
      show(search(q));
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { clear(); input.blur(); }
      if (e.key === "Enter") {
        var first = results.querySelector("a");
        if (first) { e.preventDefault(); window.location.href = first.href; }
      }
    });

    document.addEventListener("click", function (e) {
      if (!wrap.contains(e.target)) clear();
    });

    /* kick off the Fuse.js download now so the lazy index finds it already
       loaded by the time the visitor types. */
    if (!window.Fuse && document.head) {
      var lib = document.createElement("script");
      lib.src = root + "fuse.min.js";
      lib.async = true;
      document.head.appendChild(lib);
    }
  }

  /* small helper used by the header renderer */
  function isCurrent(href) {
    try {
      var target = new URL(href, location.href).pathname.replace(/\/+$/, "");
      var here = location.pathname.replace(/\/+$/, "");
      return target !== "" && target === here;
    } catch (e) { return false; }
  }

  /* ---- boot ---- */

  var configFetch = fetchJSON(root + "portal.config.json").catch(function () { return null; });
  var manifestFetch = fetchJSON(root + "tools.json");

  Promise.all([manifestFetch, configFetch])
    .then(function (pair) {
      var manifest = pair[0];
      var config = pair[1];
      var idx = indexCategories(config);
      var groups = groupTools(manifest.tools || [], idx);
      renderHeader(manifest, groups, config);
      renderGrid(groups);
      renderFooter(groups);
      setupSearch(config, groups);
    })
    .catch(function (err) {
      /* Keep the shell usable even if tools.json can't load. */
      if (header) {
        header.classList.add("site-header");
        var inner = el("div", "site-header-inner");
        var title = el("a", "site-title", "Tools");
        title.href = root || "./";
        inner.appendChild(title);
        header.appendChild(inner);
      }
      console.error("portal.js: failed to load " + root + "tools.json — " + err.message);
    });
})();
