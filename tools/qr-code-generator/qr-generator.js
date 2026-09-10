/*
 * qr-generator.js — QR Code Generator tool for Buzz Tools.
 *
 * Uses qrcode-generator (Kazuhiko Arase / davidshimjs) for the QR matrix
 * and renders modules manually for custom shapes (square, round, rounded).
 *
 * Exposes: window.QrGenerator
 */
(function () {
  "use strict";

  /* ---- State ---- */
  var state = {
    text: "https://example.com",
    shape: "round",
    fgColor: "#000000",
    bgColor: "#ffffff",
    ecl: "M",
    logoDataURL: null,     /* data: URL of the uploaded logo, if any */
    logoFileName: "",
    exportSize: 1024,
    exportFormat: "png",
  };

  /* ---- Cached DOM references (set by init) ---- */
  var dom = {};

  /** The maximum dimensions the QR code matrix can be for each ECL. */
  /* (These are approximate per the QR spec, for the 'qrcode-generator' lib
     which uses typeNumber 1–40. We'll compute them on the fly.) */

  /* ---- Helpers ---- */

  function getCanvasContext(canvas, width, height) {
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d");
    /* Prevent canvas anti-aliasing from blurring small pixel renders */
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /* Draw a single module at (x, y) of size `size` with the given shape. */
  function drawModule(ctx, x, y, size, shape, fgColor) {
    ctx.fillStyle = fgColor;
    switch (shape) {
      case "square":
        ctx.fillRect(x, y, size, size);
        break;
      case "round":
        /* Slightly less than full cell to avoid touching neighbour cells */
        var r = size * 0.48;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "rounded":
        var radius = size * 0.25;
        roundRect(ctx, x, y, size, size, radius);
        ctx.fill();
        break;
    }
  }

  /* Polyfill-friendly rounded rectangle path */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ---- QR core: generate matrix ---- */

  /**
   * Generate QR matrix and return { modules, matrixSize }.
   * modules is an array of arrays (row: col): true = dark, false = light.
   */
  function generateMatrix(text, ecl) {
    try {
      /* typeNumber 0 = auto-detect the smallest sufficient */
      var qr = qrcode(0, ecl);
      qr.addData(text);
      qr.make();
      var size = qr.getModuleCount();
      var modules = [];
      for (var row = 0; row < size; row++) {
        modules[row] = [];
        for (var col = 0; col < size; col++) {
          modules[row][col] = qr.isDark(row, col);
        }
      }
      return { modules: modules, matrixSize: size };
    } catch (e) {
      return null;
    }
  }

  /* ---- Rendering ---- */

  /**
   * Render the QR matrix to a canvas element.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {Array<Array<boolean>>} modules  — 2D boolean matrix
   * @param {number} matrixSize  — number of rows/cols
   * @param {number} canvasWidth — output pixel dimension (square)
   * @param {string} shape       — "square" | "round" | "rounded"
   * @param {string} fgColor     — hex colour for dark modules
   * @param {string} bgColor     — hex colour for background
   */
  function renderToCanvas(canvas, modules, matrixSize, canvasWidth, shape, fgColor, bgColor) {
    var QUIET = 4;  /* quiet zone: 4 modules on each side */
    var totalCells = matrixSize + 2 * QUIET;
    var cellSize = canvasWidth / totalCells;

    var ctx = getCanvasContext(canvas, canvasWidth, canvasWidth);
    ctx.imageSmoothingEnabled = false;

    /* Background */
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasWidth, canvasWidth);

    /* Data modules */
    for (var row = 0; row < matrixSize; row++) {
      for (var col = 0; col < matrixSize; col++) {
        if (modules[row][col]) {
          var x = (col + QUIET) * cellSize;
          var y = (row + QUIET) * cellSize;
          drawModule(ctx, x, y, cellSize, shape, fgColor);
        }
      }
    }

    return canvas;
  }

  /**
   * Render logo onto an already-drawn QR canvas.
   * The QR must have been rendered first on the canvas.
   */
  function renderLogo(canvas, logoDataURL, canvasWidth) {
    if (!logoDataURL) return;
    var img = new Image();
    img.onload = function () {
      var ctx = canvas.getContext("2d");
      var logoMax = canvasWidth * 0.24;
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var scale = Math.min(logoMax / w, logoMax / h, 1);
      var dw = w * scale;
      var dh = h * scale;
      var dx = (canvasWidth - dw) / 2;
      var dy = (canvasWidth - dh) / 2;

      /* White backing circle */
      ctx.save();
      ctx.fillStyle = "#ffffff";
      var pad = 4;
      ctx.beginPath();
      ctx.arc(canvasWidth / 2, canvasWidth / 2, Math.max(dw, dh) / 2 + pad, 0, Math.PI * 2);
      ctx.fill();

      /* Draw the logo */
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    };
    img.src = logoDataURL;
  }

  /* ---- Preview update ---- */

  function updatePreview() {
    if (!dom.canvas) return;
    var text = dom.input.value.trim();
    if (!text) {
      var ctx = dom.canvas.getContext("2d");
      ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
      return;
    }

    var result = generateMatrix(text, state.ecl);
    if (!result) {
      /* Text too long for this ECL — show error in preview area? For now,
         just leave the current preview. */
      return;
    }

    state.text = text;
    var PREVIEW_SIZE = 280;
    renderToCanvas(
      dom.canvas,
      result.modules,
      result.matrixSize,
      PREVIEW_SIZE,
      state.shape,
      state.fgColor,
      state.bgColor
    );

    /* Draw logo on preview if set */
    if (state.logoDataURL) {
      renderLogo(dom.canvas, state.logoDataURL, PREVIEW_SIZE);
    }

    updateCharInfo(text, result.matrixSize);
  }

  /* ---- Character info ---- */

  function updateCharInfo(text, matrixSize) {
    if (!dom.charCount) return;
    var len = text.length;
    dom.charCount.textContent = len + " character" + (len === 1 ? "" : "s");

    /* Approximate per-type capacity for this matrix size */
    if (dom.maxCapacity) {
      dom.maxCapacity.textContent = "QR version: " + matrixSize + "×" + matrixSize;
    }
  }

  /* ---- Export ---- */

  function getExportSize() {
    var sel = dom.exportSize;
    if (sel.value === "other") {
      return parseInt(dom.exportSizeOther.value, 10) || 1024;
    }
    return parseInt(sel.value, 10);
  }

  /**
   * Load an image from a data URL and return it in a callback.
   */
  function loadImage(dataURL, cb) {
    var img = new Image();
    img.onload = function () { cb(null, img); };
    img.onerror = function () { cb(new Error("Failed to load image")); };
    img.src = dataURL;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function downloadSVG(svgStr, filename) {
    var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  /**
   * Build an SVG string of the QR code with the current styling.
   */
  function buildSVG(modules, matrixSize, canvasSize, shape, fgColor, bgColor, logoDataURL) {
    var QUIET = 4;
    var totalCells = matrixSize + 2 * QUIET;
    var cellSize = canvasSize / totalCells;

    var parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + canvasSize + '" height="' + canvasSize + '" viewBox="0 0 ' + canvasSize + ' ' + canvasSize + '">');
    parts.push('<rect width="100%" height="100%" fill="' + escapeXML(bgColor) + '"/>');

    var moduleEls = [];
    for (var row = 0; row < matrixSize; row++) {
      for (var col = 0; col < matrixSize; col++) {
        if (modules[row][col]) {
          var x = (col + QUIET) * cellSize;
          var y = (row + QUIET) * cellSize;
          var s = cellSize;
          switch (shape) {
            case "square":
              moduleEls.push('<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="' + escapeXML(fgColor) + '"/>');
              break;
            case "round":
              var r = s * 0.48;
              var cx = x + s / 2;
              var cy = y + s / 2;
              moduleEls.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + escapeXML(fgColor) + '"/>');
              break;
            case "rounded":
              var rr = s * 0.25;
              moduleEls.push('<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + rr + '" ry="' + rr + '" fill="' + escapeXML(fgColor) + '"/>');
              break;
          }
        }
      }
    }
    parts.push('<g>');
    for (var i = 0; i < moduleEls.length; i++) {
      parts.push(moduleEls[i]);
    }
    parts.push('</g>');

    /* Logo overlay (if present) */
    if (logoDataURL) {
      var logoMax = canvasSize * 0.24;
      /* We can't know the logo dimensions without loading it here.
         We'll embed it as a data URI and let the browser scale it.
         For SVG export with logo, we'll use <image> tag with
         preserveAspectRatio. */
      var logoSize = logoMax;
      var lx = (canvasSize - logoSize) / 2;
      var ly = (canvasSize - logoSize) / 2;
      parts.push('<circle cx="' + (canvasSize / 2) + '" cy="' + (canvasSize / 2) + '" r="' + (logoSize / 2 + 4) + '" fill="#ffffff"/>');
      parts.push('<image href="' + escapeXML(logoDataURL) + '" x="' + lx + '" y="' + ly + '" width="' + logoSize + '" height="' + logoSize + '" preserveAspectRatio="xMidYMid meet"/>');
    }

    parts.push('</svg>');
    return parts.join("\n");
  }

  function escapeXML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function doExport() {
    var text = dom.input.value.trim();
    if (!text) return;

    var format = dom.exportFormat.value;
    var size = getExportSize();

    var result = generateMatrix(text, state.ecl);
    if (!result) {
      alert("The content is too long for the selected error correction level. Try a higher ECL or shorter input.");
      return;
    }

    if (format === "svg") {
      /* SVG export — build the SVG string */
      var svgStr = buildSVG(
        result.modules,
        result.matrixSize,
        size,
        state.shape,
        state.fgColor,
        state.bgColor,
        state.logoDataURL
      );
      downloadSVG(svgStr, "qr-code.svg");
      return;
    }

    /* Raster formats (PNG, JPEG, WebP) — render on a canvas at target size */
    var exportCanvas = document.createElement("canvas");
    exportCanvas.width = size;
    exportCanvas.height = size;

    renderToCanvas(
      exportCanvas,
      result.modules,
      result.matrixSize,
      size,
      state.shape,
      state.fgColor,
      state.bgColor
    );

    if (state.logoDataURL) {
      loadImage(state.logoDataURL, function (err, img) {
        if (!err && img) {
          var ctx = exportCanvas.getContext("2d");
          var logoMax = size * 0.24;
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          var scale = Math.min(logoMax / w, logoMax / h, 1);
          var dw = w * scale;
          var dh = h * scale;
          var dx = (size - dw) / 2;
          var dy = (size - dh) / 2;

          /* White backing */
          ctx.save();
          ctx.fillStyle = "#ffffff";
          var pad = 4;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, Math.max(dw, dh) / 2 + pad, 0, Math.PI * 2);
          ctx.fill();

          ctx.drawImage(img, dx, dy, dw, dh);
          ctx.restore();
        }
        finishExport(exportCanvas, format);
      });
    } else {
      finishExport(exportCanvas, format);
    }
  }

  function finishExport(canvas, format) {
    var mimeTypes = {
      png: "image/png",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    var exts = {
      png: "png",
      jpeg: "jpg",
      webp: "webp",
    };
    var mime = mimeTypes[format] || "image/png";
    var ext = exts[format] || "png";
    var quality = format === "jpeg" ? 0.92 : (format === "webp" ? 0.92 : undefined);

    canvas.toBlob(function (blob) {
      if (blob) {
        downloadBlob(blob, "qr-code." + ext);
      } else {
        /* Fallback: try toDataURL */
        var dataURL = canvas.toDataURL(mime, quality);
        var bin = atob(dataURL.split(",")[1]);
        var buf = new ArrayBuffer(bin.length);
        var view = new Uint8Array(buf);
        for (var i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
        var fallbackBlob = new Blob([buf], { type: mime });
        downloadBlob(fallbackBlob, "qr-code." + ext);
      }
    }, mime, quality);
  }

  /* ---- Logo handling ---- */

  function handleLogoFile(file) {
    if (!file) {
      clearLogo();
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      state.logoDataURL = e.target.result;
      state.logoFileName = file.name;
      dom.logoFilename.textContent = file.name;
      dom.logoRemove.disabled = false;

      /* Enforce ECL >= 25% when a logo is present */
      enforceEclForLogo();

      updatePreview();
    };
    reader.onerror = function () {
      clearLogo();
    };
    reader.readAsDataURL(file);
  }

  function enforceEclForLogo() {
    var currentEcl = dom.ecl.value;
    if (currentEcl === 'L' || currentEcl === 'M') {
      dom.ecl.value = 'Q';
      state.ecl = 'Q';
    }
    /* Disable L and M options while logo is loaded */
    var options = dom.ecl.options;
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === 'L' || options[i].value === 'M') {
        options[i].disabled = true;
      }
    }
  }

  function clearLogo() {
    state.logoDataURL = null;
    state.logoFileName = "";
    dom.logoFilename.textContent = "";
    dom.logoRemove.disabled = true;
    dom.logoInput.value = "";

    /* Re-enable all ECL options */
    var options = dom.ecl.options;
    for (var i = 0; i < options.length; i++) {
      options[i].disabled = false;
    }

    updatePreview();
  }

  /* ---- Init ---- */

  function init(document) {
    dom.input = document.getElementById("input-text");
    dom.canvas = document.getElementById("qr-canvas");
    dom.shape = document.getElementById("shape");
    dom.ecl = document.getElementById("ecl");
    dom.fgColor = document.getElementById("fg-color");
    dom.bgColor = document.getElementById("bg-color");
    dom.swapColors = document.getElementById("swap-colors");
    dom.resetColors = document.getElementById("reset-colors");
    dom.logoInput = document.getElementById("logo-input");
    dom.logoBtn = document.getElementById("logo-btn");
    dom.logoFilename = document.getElementById("logo-filename");
    dom.logoRemove = document.getElementById("logo-remove");
    dom.exportFormat = document.getElementById("export-format");
    dom.exportSize = document.getElementById("export-size");
    dom.exportSizeOther = document.getElementById("export-size-other");
    dom.downloadBtn = document.getElementById("download-btn");
    dom.charCount = document.getElementById("char-count");
    dom.maxCapacity = document.getElementById("max-capacity");

    /* --- Re-generate on any change --- */
    function onUpdate() {
      state.shape = dom.shape.value;
      state.ecl = dom.ecl.value;
      /* Guard: if a logo is loaded, never allow ECL below Q (25%) */
      if (state.logoDataURL && (state.ecl === 'L' || state.ecl === 'M')) {
        dom.ecl.value = 'Q';
        state.ecl = 'Q';
      }
      state.fgColor = dom.fgColor.value;
      state.bgColor = dom.bgColor.value;
      updatePreview();
    }

    dom.input.addEventListener("input", onUpdate);
    dom.shape.addEventListener("change", onUpdate);
    dom.ecl.addEventListener("change", onUpdate);
    dom.fgColor.addEventListener("input", onUpdate);
    dom.bgColor.addEventListener("input", onUpdate);

    /* Swap colours */
    dom.swapColors.addEventListener("click", function () {
      var fg = dom.fgColor.value;
      var bg = dom.bgColor.value;
      dom.fgColor.value = bg;
      dom.bgColor.value = fg;
      state.fgColor = bg;
      state.bgColor = fg;
      updatePreview();
    });

    /* Reset colours to default */
    dom.resetColors.addEventListener("click", function () {
      dom.fgColor.value = "#000000";
      dom.bgColor.value = "#ffffff";
      state.fgColor = "#000000";
      state.bgColor = "#ffffff";
      updatePreview();
    });

    /* Logo upload */
    dom.logoBtn.addEventListener("click", function () {
      dom.logoInput.click();
    });
    dom.logoInput.addEventListener("change", function () {
      handleLogoFile(this.files[0]);
    });
    dom.logoRemove.addEventListener("click", clearLogo);

    /* Export size "other" toggle */
    dom.exportSize.addEventListener("change", function () {
      var otherWrap = document.getElementById("download-size-other-wrap");
      if (this.value === "other") {
        otherWrap.style.display = "flex";
      } else {
        otherWrap.style.display = "none";
      }
    });

    /* Download */
    dom.downloadBtn.addEventListener("click", doExport);

    /* Initial render */
    updatePreview();
  }

  /* ---- Public API ---- */
  window.QrGenerator = {
    init: init,
    updatePreview: updatePreview,
  };

})();
