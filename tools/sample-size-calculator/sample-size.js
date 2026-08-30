/**
 * Sample Size Calculator
 *
 * Formulas:
 *   n0 = Z^2 * p * (1-p) / E^2
 *   with FPC: n = n0 / (1 + (n0 - 1) / N)
 *
 * Z-scores (two-tailed):
 *   90% → 1.645,  95% → 1.96,  99% → 2.576
 */
(function () {
  "use strict";

  var Z = { 90: 1.645, 95: 1.96, 99: 2.576 };
  var CONFIDENCE_LABELS = { 90: "90%", 95: "95%", 99: "99%" };

  function roundUp(n) {
    return Math.ceil(n * 100) / 100;
  }

  function nearestInt(n) {
    return Math.ceil(n);
  }

  function calc(conf, moePct, propPct, pop) {
    var z = Z[conf];
    var E = moePct / 100;
    var p = propPct / 100;
    var q = 1 - p;

    // Cochran's formula
    var n0 = (z * z * p * q) / (E * E);
    var n = n0;

    // Finite population correction
    var usesFPC = pop != null && pop > 0;
    if (usesFPC) {
      n = n0 / (1 + (n0 - 1) / pop);
    }

    return {
      n0: n0,
      n: n,
      sampleSize: nearestInt(n),
      z: z,
      confidence: conf,
      confidenceLabel: CONFIDENCE_LABELS[conf],
      moePct: moePct,
      propPct: propPct,
      pop: pop,
      usesFPC: usesFPC,
    };
  }

  function formatNum(x) {
    return x.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function init(root) {
    var form = root.getElementById("form");
    var confSel = root.getElementById("confidence");
    var marginIn = root.getElementById("margin");
    var popIn = root.getElementById("population");
    var propIn = root.getElementById("proportion");
    var output = root.getElementById("output");
    var resultVal = root.getElementById("result-value");
    var resultNote = root.getElementById("result-note");
    var resultDetails = root.getElementById("result-details");
    var clearBtn = root.getElementById("clear-btn");

    function compute() {
      var conf = parseInt(confSel.value, 10);
      var moe = parseFloat(marginIn.value);
      var prop = parseFloat(propIn.value);
      var popRaw = popIn.value.trim();
      var pop = popRaw !== "" ? parseInt(popRaw, 10) : null;

      if (isNaN(conf) || isNaN(moe) || isNaN(prop)) {
        output.classList.remove("has-result");
        return;
      }
      if (moe <= 0 || prop <= 0 || prop >= 100) {
        output.classList.remove("has-result");
        return;
      }
      if (pop != null && (isNaN(pop) || pop < 1)) {
        output.classList.remove("has-result");
        return;
      }

      var r = calc(conf, moe, prop, pop);

      resultVal.textContent = formatNum(r.sampleSize);

      var parts = [];
      if (r.usesFPC) {
        parts.push("Adjusted for a population of " + formatNum(r.pop) + " using the finite population correction.");
      }
      parts.push("Uncorrected sample size (infinite population): " + formatNum(nearestInt(r.n0)) + ".");
      resultNote.textContent = parts.join(" ");

      var details = "";
      details += "Confidence level: " + r.confidenceLabel + " (Z = " + r.z + ")\n";
      details += "Margin of error: \u00B1" + r.moePct + "%\n";
      details += "Estimated proportion: " + r.propPct + "%\n";
      if (r.usesFPC) {
        details += "Population size: " + formatNum(r.pop) + "\n";
        details += "FPC-adjusted sample size: " + formatNum(r.sampleSize) + "\n";
      }
      details += "\nFormula: n\u2080 = Z\u00B2 \u00D7 p(1-p) / E\u00B2";
      if (r.usesFPC) {
        details += "\nAdjusted: n = n\u2080 / (1 + (n\u2080 - 1) / N)";
      }
      resultDetails.textContent = details;

      output.classList.add("has-result");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      compute();
    });

    clearBtn.addEventListener("click", function () {
      confSel.value = "95";
      marginIn.value = "5";
      popIn.value = "";
      propIn.value = "50";
      output.classList.remove("has-result");
    });

    // Compute on load with defaults
    compute();
  }

  window.SampleSize = { init: init };
})();
