/*
 * scramble.js — word-scrambling logic + DOM wiring.
 * Exposes Scramble on window for the page script to call.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.Scramble = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Fisher-Yates shuffle (in-place). Returns the array. */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /*
   * Scramble the letters of a single word.
   * - If keepEnds is true, the first and last letters stay in place
   *   and everything between is shuffled.
   * - Words of length <= 3 are returned as-is (shuffling 1-2 interior
   *   letters is meaningless and often looks the same).
   */
  function scrambleWord(word, keepEnds) {
    if (word.length <= 3) return word;
    const letters = word.split("");
    if (keepEnds) {
      const mid = letters.slice(1, -1);
      shuffle(mid);
      return letters[0] + mid.join("") + letters[letters.length - 1];
    }
    return shuffle(letters).join("");
  }

  /*
   * Scramble every word in a string, preserving word boundaries and
   * leading/trailing punctuation attached to each word.
   * Punctuation characters: . , ! ? : ; " ' - ( ) [ ] { } / @ # $ % ^ & * + = < > ~ _ |
   */
  const PUNCT = /^([^a-zA-Z]*)([a-zA-Z].*[a-zA-Z])([^a-zA-Z]*)$/;
  const WORD_BOUNDARY = /(\s+)/;

  function scrambleText(text, keepEnds) {
    const segments = text.split(WORD_BOUNDARY);
    return segments.map(function (seg) {
      // If it's whitespace, pass through
      if (/^\s+$/.test(seg)) return seg;
      // Try to isolate leading punctuation, core word, trailing punctuation
      const m = PUNCT.exec(seg);
      if (m) {
        return m[1] + scrambleWord(m[2], keepEnds) + (m[3] || "");
      }
      // Fallback: just treat the whole thing as a word
      return scrambleWord(seg, keepEnds);
    }).join("");
  }

  /* wire the page up. safe to call only in the browser. */
  function init(document) {
    const form    = document.getElementById("form");
    const input   = document.getElementById("phrase");
    const button  = document.getElementById("submit");
    const output  = document.getElementById("output");

    const resultText = document.getElementById("result-text");
    const actions    = document.getElementById("actions");
    const copyBtn    = document.getElementById("copy-btn");
    const rescramble = document.getElementById("rescramble");
    const keepEndsCb = document.getElementById("keep-ends");

    function render(scrambled) {
      resultText.textContent = scrambled;
      output.classList.add("has-result");
    }

    function clear() {
      output.classList.remove("has-result");
      resultText.textContent = "";
    }

    function onSubmit(ev) {
      ev.preventDefault();
      const text = input.value.trim();
      if (!text) { clear(); return; }
      const scrambled = scrambleText(text, keepEndsCb.checked);
      render(scrambled);
    }

    copyBtn.addEventListener("click", async function () {
      const text = resultText.textContent;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 1200);
      } catch (err) {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = "Copy"; }, 1200);
      }
    });

    rescramble.addEventListener("click", function () {
      const text = input.value.trim();
      if (!text) return;
      const scrambled = scrambleText(text, keepEndsCb.checked);
      render(scrambled);
    });

    // Keep-ends toggle re-scrambles the current input automatically
    keepEndsCb.addEventListener("change", function () {
      const text = input.value.trim();
      if (!text) return;
      const scrambled = scrambleText(text, keepEndsCb.checked);
      render(scrambled);
    });

    form.addEventListener("submit", onSubmit);

    // Allow pasting and hitting Enter without needing to click Submit
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event("submit"));
      }
    });

    if (input && document.activeElement !== input) input.focus();
  }

  return { shuffle, scrambleWord, scrambleText, init };
});
