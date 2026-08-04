/*
 * unscramble.js — core word-unscrambling logic + DOM wiring.
 * Works standalone in the browser, and is require()able from Node for tests.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.Unscramble = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Words shorter than this are never offered (drops the boring "a" / "i" and obscure 2-letter Scrabble words).
  const MIN_WORD_LENGTH = 3;

  /* letter frequency of a lowercase a-z word, as a 26-slot Uint8Array */
  function count(word) {
    const c = new Uint8Array(26);
    for (let i = 0; i < word.length; i++) c[word.charCodeAt(i) - 97]++;
    return c;
  }

  /* can the word (given its prefixed counts) be spelled from available letters counts? */
  function canSpell(wordCounts, available) {
    for (let i = 0; i < 26; i++) {
      if (wordCounts[i] > available[i]) return false;
    }
    return true;
  }

  /* fetch + parse dictionary file -> { words: string[], counts: Uint8Array[] } */
  async function loadDictionary(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load dictionary (HTTP " + res.status + ")");
    const text = await res.text();
    const words = [];
    const counts = [];
    for (const raw of text.split(/\r?\n/)) {
      const w = raw.trim().toLowerCase();
      if (w.length < MIN_WORD_LENGTH) continue;
      if (!/^[a-z]+$/.test(w)) continue;
      words.push(w);
      counts.push(count(w));
    }
    return { words, counts };
  }

  /* strip anything that isn't a letter; case-insensitive */
  function normalize(input) {
    return String(input || "").toLowerCase().replace(/[^a-z]/g, "");
  }

  /*
   * All words spellable from `letters`. Longest first; alphabetical as a
   * tie-break so the same input always gives the same stable order.
   */
  function solve(letters, dict) {
    const available = count(normalize(letters));
    const { words, counts } = dict;
    const found = [];
    for (let i = 0; i < words.length; i++) {
      if (canSpell(counts[i], available)) found.push(words[i]);
    }
    found.sort((a, b) => (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0));
    return found;
  }

  /* wire the page up. safe to call only in the browser. */
  function init(document) {
    const form = document.getElementById("form");
    const input = document.getElementById("letters");
    const button = document.getElementById("submit");
    const status = document.getElementById("status");
    const results = document.getElementById("results");

    const output = {
      count: document.createElement("p"),
      words: document.createElement("p"),
      meta: document.createElement("p")
    };
    output.count.className = "count";
    output.words.className = "words";
    output.meta.className = "meta";
    results.appendChild(output.count);
    results.appendChild(output.words);
    results.appendChild(output.meta);

    let dict = null;
    let loading = null;

    function render(words, letters, ms) {
      results.className = "has-result";
      const n = words.length;
      output.count.textContent = n
        ? (n === 1 ? "1 word" : n + " words") + " from “" + letters + "”"
        : "No words can be spelled from those letters.";
      output.words.innerHTML = words.map(w =>
        `<button class="word-btn" data-word="${w}" aria-label="Copy ${w}" title="Copy ${w}">
           <span class="word-text">${w}</span>
           <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
             <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
             <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
           </svg>
         </button>`
      ).join(" ");
      output.meta.textContent = n ? "found in " + ms + " ms" : "";

      // Attach copy handlers
      output.words.querySelectorAll(".word-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          const word = btn.dataset.word;
          try {
            await navigator.clipboard.writeText(word);
            btn.classList.add("copied");
            btn.setAttribute("aria-label", "Copied " + word);
            setTimeout(() => {
              btn.classList.remove("copied");
              btn.setAttribute("aria-label", "Copy " + word);
            }, 1200);
          } catch (err) {
            // Fallback for non-secure contexts
            const textarea = document.createElement("textarea");
            textarea.value = word;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            btn.classList.add("copied");
            setTimeout(() => btn.classList.remove("copied"), 1200);
          }
        });
      });
    }

    function error(msg) {
      results.className = "has-result empty";
      output.count.textContent = msg;
      output.words.textContent = "";
      output.meta.textContent = "";
    }

    async function onSubmit(ev) {
      ev.preventDefault();
      const letters = normalize(input.value);
      if (!letters) { error("Enter some letters first."); return; }

      try {
        if (!dict) {
          if (!loading) {
            button.disabled = true;
            status.textContent = "Loading dictionary…";
            loading = loadDictionary("words.txt")
              .then((d) => { dict = d; })
              .finally(() => {
                loading = null;
                button.disabled = false;
                status.textContent = "";
              });
          }
          await loading;
        }
        const t0 = performance.now();
        const words = solve(letters, dict);
        const ms = (performance.now() - t0).toFixed(1);
        render(words, letters, ms);
      } catch (err) {
        error("Couldn't load the dictionary (" + err.message + ").");
      }
    }

    form.addEventListener("submit", onSubmit);
    if (input && document.activeElement !== input) input.focus();
  }

  return { MIN_WORD_LENGTH, count, normalize, solve, loadDictionary, init };
});
