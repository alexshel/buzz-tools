/**
 * Margin of Error Calculator
 *
 * Formula:
 *   MOE = Z * sqrt(p * (1-p) / n)
 *   with FPC: MOE = Z * sqrt(p * (1-p) / n) * sqrt((N - n) / (N - 1))
 *
 * Z-scores (two-tailed):
 *   90% → 1.645,  95% → 1.96,  99% → 2.576
 */
(function () {
  "use strict";

  var Z = { 80: 1.282, 85: 1.440, 90: 1.645, 95: 1.96, 99: 2.576 };
  var CONFIDENCE_LABELS = { 80: "80%", 85: "85%", 90: "90%", 95: "95%", 99: "99%" };

  function calc(conf, n, propPct, pop) {
    var z = Z[conf];
    var p = propPct / 100;
    var q = 1 - p;

    var se = Math.sqrt((p * q) / n);
    var moe = z * se;

    // Finite population correction
    var usesFPC = pop != null && pop > 0 && pop > n;
    if (usesFPC) {
      var fpc = Math.sqrt((pop - n) / (pop - 1));
      moe = moe * fpc;
    }

    var moePct = moe * 100;
    var lower = (p - moe) * 100;
    var upper = (p + moe) * 100;

    return {
      moePct: moePct,
      lowerPct: Math.max(0, lower),
      upperPct: Math.min(100, upper),
      z: z,
      confidence: conf,
      confidenceLabel: CONFIDENCE_LABELS[conf],
      n: n,
      propPct: propPct,
      pop: pop,
      usesFPC: usesFPC,
    };
  }

  function fmt(x) {
    return x.toFixed(1);
  }

  function init(root) {
    var form = root.getElementById("form");
    var confSel = root.getElementById("confidence");
    var sizeIn = root.getElementById("size");
    var popIn = root.getElementById("population");
    var propIn = root.getElementById("proportion");
    var output = root.getElementById("output");
    var resultVal = root.getElementById("result-value");
    var resultInterval = root.getElementById("result-interval");
    var resultDetails = root.getElementById("result-details");
    var clearBtn = root.getElementById("clear-btn");

    function compute() {
      var conf = parseInt(confSel.value, 10);
      var n = parseInt(sizeIn.value, 10);
      var prop = parseFloat(propIn.value);
      var popRaw = popIn.value.trim();
      var pop = popRaw !== "" ? parseInt(popRaw, 10) : null;

      if (isNaN(conf) || isNaN(n) || isNaN(prop)) {
        output.classList.remove("has-result");
        return;
      }
      if (n < 1 || prop <= 0 || prop >= 100) {
        output.classList.remove("has-result");
        return;
      }
      if (pop != null && isNaN(pop)) {
        output.classList.remove("has-result");
        return;
      }

      var r = calc(conf, n, prop, pop);

      resultVal.textContent = "\u00B1" + fmt(r.moePct) + "%";

      var interval = fmt(r.lowerPct) + "% to " + fmt(r.upperPct) + "%";
      resultInterval.textContent = "Confidence interval: " + interval + " (at " + r.confidenceLabel + " confidence)";

      var details = "";
      details += "Confidence level: " + r.confidenceLabel + " (Z = " + r.z + ")\n";
      details += "Sample size: " + r.n + "\n";
      details += "Observed proportion: " + r.propPct + "%\n";
      if (r.usesFPC) {
        details += "Population size: " + r.pop + "\n";
        details += "FPC applied (sampling " + fmt((r.n / r.pop) * 100) + "% of population)\n";
      }
      details += "\nFormula: MOE = Z \u00D7 \u221A(p(1-p)/n)";
      if (r.usesFPC) {
        details += " \u00D7 \u221A((N-n)/(N-1))";
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
      sizeIn.value = "100";
      popIn.value = "";
      propIn.value = "50";
      output.classList.remove("has-result");
    });

    compute();
  }

  window.MarginOfError = { init: init };
})();
