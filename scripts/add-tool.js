#!/usr/bin/env node
/**
 * Tool Scaffold Generator
 * Usage: node scripts/add-tool.js --slug my-tool --name "My Tool" --category dev-utilities --description "Does amazing things" [--icon 🔧] [--tags "word,puzzle"]
 *
 * Also updates tools.json (manifest entry, status "building") and uses the
 * category's color from portal.config.json for the generated page theme.
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      config[key] = args[i + 1]?.startsWith('--') ? true : args[i + 1];
      if (!args[i + 1]?.startsWith('--')) i++;
    }
  }
  return config;
}

function validateConfig(config) {
  const required = ['slug', 'name', 'category', 'description'];
  for (const field of required) {
    if (!config[field]) {
      console.error(`❌ Missing required field: --${field}`);
      process.exit(1);
    }
  }
  if (!/^[a-z0-9-]+$/.test(config.slug)) {
    console.error('❌ Slug must be lowercase alphanumeric with hyphens only');
    process.exit(1);
  }
  return config;
}

function generateToolHtml(config, colors) {
  const { slug, name, description, category } = config;
  const icon = config.icon || '🔧';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
  <link rel="stylesheet" href="../../portal.css">
<style>
  /* Category accent overrides; shared chrome (tokens, body base, .card, h1,
     .subtitle, form, button, .status, .foot) comes from portal.css. */
  :root {
    --accent: ${colors.accent};
    --accent-hover: ${colors.hover};
    --ring: ${colors.ring};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --accent-hover: ${colors.darkHover};
      --ring: ${colors.darkRing};
    }
  }
  textarea {
    width: 100%;
    padding: 14px 16px;
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 12px;
    outline: none;
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  textarea::placeholder { color: var(--ink-soft); font-weight: 400; opacity: 0.75; }
  textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
  .output { margin-top: 24px; border-top: 1px solid var(--rule); padding-top: 20px; }
  .output h3 { font-size: 1rem; font-weight: 600; margin: 0 0 12px; }
  .output pre { background: var(--bg); border: 1px solid var(--rule); border-radius: 8px; padding: 16px; overflow: auto; font-size: 0.9rem; line-height: 1.6; }
</style>
</head>
<body class="tool-page tool-page--center">
  <header id="site-header"></header>
  <main class="card">
    <h1>${name}</h1>
    <p class="subtitle">${description}</p>

    <form id="form" autocomplete="off">
      <label for="input" hidden>Input</label>
      <textarea id="input" name="input" rows="4" placeholder="Enter your input here..." spellcheck="false"></textarea>
      <button id="submit" type="submit">Run</button>
    </form>

    <p id="status" class="status"></p>
    <section id="output" class="output" aria-live="polite" hidden>
      <h3>Output</h3>
      <pre id="result"></pre>
    </section>

    <p class="foot">Runs entirely in your browser · No data leaves your machine</p>
  </main>

  <noscript><p style="text-align:center;padding:20px">This tool needs JavaScript enabled.</p></noscript>
  <script src="${slug}.js"></script>
  <script>${slug.charAt(0).toUpperCase() + slug.slice(1)}.init(document);</script>
  <script src="../../portal.js"></script>
</body>
</html>`;
}

function generateToolJs(config) {
  const { slug } = config;
  const className = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

  return `/**
 * ${className} — ${config.description}
 * Runs entirely in the browser. No server calls.
 */

const ${className} = (() => {
  "use strict";

  let form, input, submit, status, output, result;

  function init(doc) {
    form = doc.getElementById("form");
    input = doc.getElementById("input");
    submit = doc.getElementById("submit");
    status = doc.getElementById("status");
    output = doc.getElementById("output");
    result = doc.getElementById("result");

    form.addEventListener("submit", handleSubmit);
    input.addEventListener("input", () => { status.textContent = ""; });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) { status.textContent = "Please enter some input"; return; }

    setLoading(true);
    status.textContent = "Processing...";

    try {
      const processed = await process(value);
      result.textContent = processed;
      output.hidden = false;
      status.textContent = "Done!";
    } catch (err) {
      status.textContent = "Error: " + err.message;
      output.hidden = true;
    } finally {
      setLoading(false);
    }
  }

  async function process(input) {
    // TODO: Implement your tool logic here
    // Return the processed result as a string
    return "Result for: " + input;
  }

  function setLoading(isLoading) {
    submit.disabled = isLoading;
    submit.textContent = isLoading ? "Processing..." : "Run";
    input.disabled = isLoading;
  }

  return { init };
})();`;
}

function loadJson(relPath) {
  const p = path.join(__dirname, '..', relPath);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    console.error(`❌ Cannot read ${relPath}: ${e.message}`);
    process.exit(1);
  }
}

/** Mix two #rrggbb colors: t=0 -> a, t=1 -> b. */
function mix(a, b, t) {
  const pa = a.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const pb = b.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!pa || !pb) return a;
  const ch = (i) => {
    const v = Math.round(parseInt(pa[i], 16) + (parseInt(pb[i], 16) - parseInt(pa[i], 16)) * t);
    return v.toString(16).padStart(2, '0');
  };
  return `#${ch(1)}${ch(2)}${ch(3)}`;
}

/** Derive accent-family tokens from the category color (with dark-mode guards). */
function makeColors(accent) {
  return {
    accent,
    hover: mix(accent, '#000000', 0.12),
    darkHover: mix(accent, '#ffffff', 0.12),
    ring: accent + '59',     // 35% alpha focus ring
    darkRing: accent + '66', // 40% alpha focus ring in dark mode
  };
}

function manifestEntryExists(manifest, slug) {
  return Array.isArray(manifest.tools) && manifest.tools.some(t => t && t.slug === slug);
}

function main() {
  const config = validateConfig(parseArgs());

  // -- category must be a real portal.config.json category id -----------------
  const portalConfig = loadJson('portal.config.json');
  const categories = Array.isArray(portalConfig.categories) ? portalConfig.categories : [];
  const category = categories.find(c => c && c.id === config.category);
  if (!category) {
    const ids = categories.map(c => c.id).join(', ');
    console.error(`❌ Unknown category "${config.category}". Valid ids: ${ids}`);
    process.exit(1);
  }

  const toolDir = path.join(__dirname, '..', 'tools', config.slug);
  if (fs.existsSync(toolDir)) {
    console.error(`❌ Tool directory already exists: tools/${config.slug}`);
    process.exit(1);
  }

  const manifest = loadJson('tools.json');
  if (manifestEntryExists(manifest, config.slug)) {
    console.error(`❌ tools.json already contains a tool with slug "${config.slug}"`);
    process.exit(1);
  }

  fs.mkdirSync(toolDir, { recursive: true });
  const colors = makeColors(category.color || '#4f46e5');

  fs.writeFileSync(path.join(toolDir, 'index.html'), generateToolHtml(config, colors));
  fs.writeFileSync(path.join(toolDir, `${config.slug}.js`), generateToolJs(config));

  // -- manifest: append the entry with status "building" ----------------------
  const readme = `# ${config.name}

${config.description}

## Usage

Open \`index.html\` in a browser, or serve the \`tools/${config.slug}/\` directory.

## Development

\`\`\`bash
# Serve locally
npm run serve
\`\`\`

## Adding to Portal

The \`tool:add\` scaffold already wrote this tool's entry to \`tools.json\`
(status: \`"building"\`). When the tool is finished, flip \`"status"\` to
\`"live"\` in \`tools.json\` and run \`npm run validate\` before pushing.

## License

MIT
`;
  fs.writeFileSync(path.join(toolDir, 'README.md'), readme);

  const tags = config.tags
    ? config.tags.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  manifest.tools.push({
    slug: config.slug,
    name: config.name,
    description: config.description,
    icon: config.icon || '🔧',
    category: config.category,
    tags,
    status: 'building',
  });
  fs.writeFileSync(path.join(__dirname, '..', 'tools.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`✅ Created tool scaffold at tools/${config.slug}/`);
  console.log(`   - index.html (shared styling, ${category.name} accent ${colors.accent})`);
  console.log(`   - ${config.slug}.js (tool logic template)`);
  console.log(`   - README.md`);
  console.log(`   - tools.json entry (slug "${config.slug}", status "building")`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Implement your tool logic in ${config.slug}.js`);
  console.log(`   2. Run: npm run validate`);
  console.log(`   3. Flip "status" to "live" in tools.json when the tool is ready`);
  console.log(`   4. Test: npm run serve && open http://localhost:8000/tools/${config.slug}/`);
}

main();
