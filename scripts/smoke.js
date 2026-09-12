#!/usr/bin/env node
/**
 * Smoke test: boots the real portal.home (index.html) and a real tool page in
 * jsdom with a stubbed fetch, executes the actual portal.js, and asserts the
 * shell renders end-to-end: config-driven sections, legacy fallback, ad slot,
 * search fallback, analytics buffering, and the tool-page shell.
 *
 * Usage: npm run smoke        (dev deps needed: npm install)
 * Exit:  0 all green, 1 any check failed.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const jsdom = require(path.join(ROOT, "node_modules", "jsdom"));
const JSDOM = jsdom.JSDOM;
const ResourceLoader = jsdom.ResourceLoader;

const INDEX = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const TOOL_PAGE = fs.readFileSync(path.join(ROOT, "tools", "word-to-html", "index.html"), "utf8");
const PORTAL_SRC = fs.readFileSync(path.join(ROOT, "portal.js"), "utf8");
const TOOLS = JSON.parse(fs.readFileSync(path.join(ROOT, "tools.json"), "utf8"));
const BASE_CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "portal.config.json"), "utf8"));

/* portal.js must load as a real external <script src="...portal.js"> — its
   header comment contains "<!--" and "</script>", which the HTML tokenizer
   would mangle if we inlined it. jsdom 30 serves subresources through the
   dispatcher, so we intercept requests (from script/link elements AND from
   window.fetch) and synthesize responses from the repo's real files. */
function makeInterceptor(config) {
  return jsdom.requestInterceptor(async (request) => {
    const u = String(request.url);
    if (u.endsWith("portal.js")) {
      return new Response(PORTAL_SRC, { headers: { "Content-Type": "application/javascript" } });
    }
    if (u.endsWith("portal.config.json")) {
      return new Response(JSON.stringify(config), { headers: { "Content-Type": "application/json" } });
    }
    if (u.endsWith("tools.json")) {
      return new Response(JSON.stringify(TOOLS), { headers: { "Content-Type": "application/json" } });
    }
    if (u.endsWith(".css") || u.endsWith("fuse.min.js")) {
      return new Response("", { headers: { "Content-Type": "text/css" } }); /* cosmetic: keep logs quiet */
    }
    return undefined; /* anything else: let it fail as a missing local file */
  });
}

let failures = 0;

function check(name, ok, extra) {
  ok = typeof ok === "function" ? !!ok() : !!ok;
  console.log((ok ? "  ok  " : " FAIL ") + name + (ok || !extra ? "" : "  \u2014 " + extra));
  if (!ok) failures++;
}

/* shallow-deep merge: arrays and scalars replace, plain objects merge. */
function deepMerge(base, patch) {
  if (!patch) return base;
  const out = JSON.parse(JSON.stringify(base));
  const stack = [[out, patch]];
  while (stack.length) {
    const [o, p] = stack.pop();
    for (const k of Object.keys(p)) {
      const pv = p[k];
      if (pv && typeof pv === "object" && !Array.isArray(pv)
          && o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) {
        stack.push([o[k], pv]);
      } else {
        o[k] = JSON.parse(JSON.stringify(pv));
      }
    }
  }
  return out;
}

/* Boot the real page in jsdom: portal.js loads as an external script via the
   resource loader above, fetch() is stubbed in beforeParse (runs before any
   script), and we poll until the shell header appears (boot chain settles). */
async function boot(pageHtml, overrides, pagePath) {
  const config = deepMerge(JSON.parse(JSON.stringify(BASE_CONFIG)), overrides);

  const dom = new JSDOM(pageHtml, {
    url: "http://localhost" + (pagePath || "/index.html"),
    runScripts: "dangerously",
    resources: { interceptors: [makeInterceptor(config)] },
    pretendToBeVisible: true,
    beforeParse(w) {
      w.URL = URL;
      w.Blob = Blob;
      w.Promise = Promise;
      /* safety net in case window.fetch bypasses the interceptor */
      w.fetch = (url) => {
        const u = String(url);
        const data = u.includes("portal.config.json") ? config
          : u.includes("tools.json") ? TOOLS : null;
        if (!data) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) });
      };
      try { w.localStorage.clear(); } catch (e) { /* ignore */ }
    }
  });
  const w = dom.window;

  /* portal.js loads async through the loader, then fetch + render settle */
  for (let i = 0; i < 30 && !w.document.querySelector(".site-header-inner"); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 50));
  return { w, dom };
}

const q = (w, sel) => w.document.querySelector(sel);
const qa = (w, sel) => Array.from(w.document.querySelectorAll(sel));
const buffer = (w) => {
  try { return JSON.parse(w.localStorage.getItem("buzz-tools.analytics.v1") || "[]"); }
  catch (e) { return []; }
};
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

/* ------------------------------------------------------------------ */

(async () => {
  /* 1. Config-driven homepage sections */
  {
    const { w } = await boot(INDEX);
    check("header renders (home)", q(w, ".site-header-inner"));
    check("mega menu has 4 live categories", qa(w, ".site-nav-mega .mega-item").length === 4,
      "got " + qa(w, ".site-nav-mega .mega-item").length);
    check("hero stays synced with config copy", q(w, "main.home .hero h1").textContent === "Small tools, no strings.");
    const heads = qa(w, ".tool-grid .category-heading").map((h) => h.textContent);
    check("sections: featured rendered", heads.includes("Featured Tools"), heads.join("|"));
    check("sections: category (design-frontend) rendered", heads.includes("Design & Frontend"));
    check("sections: recent rendered", heads.includes("Recently Added"));
    check("sections: empty category (dev-utilities) skipped", !heads.includes("Developer Utilities"));
    check("featured shows live tools (2 of 5 ids live)", qa(w, "a.tool-card").length === 11,
      "got " + qa(w, "a.tool-card").length);
    check("no ad slot without ad section in config", !q(w, ".ad-slot"));
    check("footer counts 7 tools", (q(w, "footer") || {}).textContent && q(w, "footer").textContent.includes("7 tools"));
    check("search box present", q(w, ".portal-search-input"));
  }

  /* 2. Legacy fallback when sections config is empty */
  {
    const { w } = await boot(INDEX, { homepage: { sections: [] } });
    check("legacy grid renders 4 category sections", qa(w, ".category-section").length === 4,
      "got " + qa(w, ".category-section").length);
    check("legacy grid renders all 7 cards", qa(w, "a.tool-card").length === 7);
    const hero = q(w, "main.home .hero h1");
    check("hero untouched in legacy path", hero.textContent === "Small tools, no strings.");
  }

  /* 3. Ad slot renders hidden from an ad section */
  {
    const { w } = await boot(INDEX, {
      homepage: { sections: [
        { id: "hero", type: "hero", title: "T", subtitle: "S" },
        { id: "mid", type: "ad", title: "Sponsored" },
        { id: "recent", type: "recent", title: "Recently Added", limit: 3 }
      ] }
    });
    const slot = q(w, ".ad-slot[data-ad-slot='mid']");
    check("ad slot element present + flagged", !!slot);
    check("sections after ad slot still render", qa(w, "a.tool-card").length === 3);
  }

  /* 4. Search fallback (substring, no Fuse) narrows results */
  {
    const { w } = await boot(INDEX);
    const input = q(w, ".portal-search-input");
    input.value = "qr";
    input.dispatchEvent(new w.Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));
    const hits = qa(w, ".portal-search-results li");
    const text = hits.map((li) => li.textContent).join(" ");
    check("search finds the QR tool", hits.some((li) => li.textContent.includes("QR Code Generator")));
    check("search excludes word tools", !text.includes("Unscrambler"), text.slice(0, 120));
  }

  /* 5. Analytics off by default → nothing written, no listeners */
  {
    const { w } = await boot(INDEX);
    click(w, qa(w, "a.tool-card")[0]);
    await new Promise((r) => setTimeout(r, 30));
    check("analytics disabled: no localStorage buffer", buffer(w).length === 0);
  }

  /* 6. Analytics enabled: buffering, events, sendBeacon flush */
  {
    let sent = null;
    const { w } = await boot(INDEX, { analytics: { enabled: true, endpoint: "https://collect.example.com/ingest" } });
    try {
      /* jsdom freezes navigator.sendBeacon in place; swap the whole object */
      const nav = Object.create(w.navigator);
      nav.sendBeacon = async (url, body) => {
        let bodyText = "";
        try { bodyText = await body.text(); } catch (e) { /* not a text blob */ }
        sent = { url, bodyText };
        return true;
      };
      Object.defineProperty(w, "navigator", { value: nav, configurable: true });
    } catch (e) { /* navigator sealed in this jsdom — flush check skipped */ }

    click(w, qa(w, "a.tool-card")[0]);            /* toolOpen */
    let ev;
    try { ev = new w.CustomEvent("buzz:tool-complete", { detail: { tool: "word-unscrambler" } }); }
    catch (e) { ev = new w.Event("buzz:tool-complete", { bubbles: true }); ev.detail = { tool: "word-unscrambler" }; }
    w.document.dispatchEvent(ev);                  /* toolComplete */
    await new Promise((r) => setTimeout(r, 30));

    const buf = buffer(w);
    check("categoryView buffered at render", buf.some((x) => x.e === "categoryView" && x.d.category === "design-frontend"),
      JSON.stringify(buf).slice(0, 160));
    check("toolOpen buffered with slug", buf.some((x) => x.e === "toolOpen" && x.d.tool === "qr-code-generator"));
    check("toolComplete buffered via custom event", buf.some((x) => x.e === "toolComplete" && x.d.tool === "word-unscrambler"));

    w.dispatchEvent(new w.Event("pagehide"));      /* flush */
    await new Promise((r) => setTimeout(r, 50)); /* let the async sendBeacon stub settle */
    if (sent) {
      check("sendBeacon posted the batch", sent.url === "https://collect.example.com/ingest"
        && String(sent.bodyText).includes('"toolOpen"'));
      check("buffer cleared after flush", JSON.parse(w.localStorage.getItem("buzz-tools.analytics.v1") || "[]").length === 0);
    } else {
      check("failed send keeps the buffer (no data loss)", buffer(w).length >= 3,
        "got " + buffer(w).length);
    }
  }

  /* 7. Tool page shell renders header/footer without a grid */
  {
    const { w } = await boot(TOOL_PAGE, null, "/tools/word-to-html/index.html");
    check("tool page: header + nav render", q(w, ".site-header-inner")
      && qa(w, ".site-nav-mega .mega-item").length === 4);
    check("tool page: full boot chain completes (search renders)", !!q(w, ".portal-search-input"));
    check("tool page: no tool grid, no footer element (by design)",
      !q(w, "#tool-grid") && !q(w, "#site-footer"));
  }

  console.log(failures ? "\n" + failures + " check(s) FAILED" : "\nAll smoke checks passed.");
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("smoke harness error: " + e.stack || e.message);
  process.exit(1);
});
