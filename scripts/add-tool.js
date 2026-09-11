#!/usr/bin/env node
/**
 * Tool Scaffold Generator
 * Usage: node scripts/add-tool.js --slug my-tool --name "My Tool" --category dev-utilities --description "Does amazing things"
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

function generateToolHtml(config) {
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
  :root {
    --bg: #f4f5f7;
    --card: #ffffff;
    --ink: #1c1e21;
    --ink-soft: #6b7280;
    --rule: #e5e7eb;
    --accent: #4f46e5;
    --accent-hover: #4338ca;
    --accent-ink: #ffffff;
    --ring: rgba(79, 70, 229, 0.35);
    --radius: 16px;
    --shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.18);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1115;
      --card: #1a1d24;
      --ink: #e7e9ee;
      --ink-soft: #9aa1ad;
      --rule: #2a2f3a;
      --accent: #6d65f0;
      --accent-hover: #7d76f5;
      --accent-ink: #ffffff;
      --ring: rgba(109, 101, 240, 0.4);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -12px rgba(0, 0, 0, 0.6);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    display: grid;
    place-items: center;
    padding: 88px 16px 32px;
  }
  .card {
    width: 100%;
    max-width: 640px;
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 40px 40px 32px;
  }
  h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; }
  .subtitle { color: var(--ink-soft); font-size: 0.95rem; line-height: 1.5; margin: 0 0 28px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  input, textarea {
    width: 100%;
    padding: 14px 16px;
    font-size: 1rem;
    font-weight: 500;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--rule);
    border-radius: 12px;
    outline: none;
    transition: border-color 120ms ease, box-shadow 120ms ease;
    font-family: inherit;
  }
  input::placeholder, textarea::placeholder { color: var(--ink-soft); font-weight: 400; opacity: 0.75; }
  input:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
  button {
    padding: 13px 16px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent-ink);
    background: var(--accent);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: background 120ms ease;
  }
  button:hover { background: var(--accent-hover); }
  button:disabled { opacity: 0.6; cursor: progress; }
  button:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  .status { margin: 14px 0 0; font-size: 0.9rem; color: var(--ink-soft); text-align: center; }
  .output { margin-top: 24px; border-top: 1px solid var(--rule); padding-top: 20px; }
  .output h3 { font-size: 1rem; font-weight: 600; margin: 0 0 12px; }
  .output pre { background: var(--bg); border: 1px solid var(--rule); border-radius: 8px; padding: 16px; overflow: auto; font-size: 0.9rem; line-height: 1.6; }
  .foot { margin: 28px 0 0; font-size: 0.78rem; color: var(--ink-soft); text-align: center; }
  @media (max-width: 520px) { .card { padding: 28px 20px 24px; } }
</style>
</head>
<body>
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

function main() {
  const config = validateConfig(parseArgs());

  const toolDir = path.join(__dirname, '..', 'tools', config.slug);
  if (fs.existsSync(toolDir)) {
    console.error(`❌ Tool directory already exists: tools/${config.slug}`);
    process.exit(1);
  }

  fs.mkdirSync(toolDir, { recursive: true });

  fs.writeFileSync(path.join(toolDir, 'index.html'), generateToolHtml(config));
  fs.writeFileSync(path.join(toolDir, `${config.slug}.js`), generateToolJs(config));

  const readme = `# ${config.name}

${config.description}

## Usage

Open \`index.html\` in a browser, or serve the \`tools/${config.slug}/\` directory.

## Development

\`\`\`bash
# Serve locally
npx serve tools/${config.slug}
\`\`\`

## Adding to Portal

Add an entry to \`tools.json\` at the repo root with the same \`slug\`, \`name\`, \`description\`, \`icon\`, and \`category\`.

## License

MIT
`;
  fs.writeFileSync(path.join(toolDir, 'README.md'), readme);

  console.log(`✅ Created tool scaffold at tools/${config.slug}/`);
  console.log(`   - index.html (tool page with shared styling)`);
  console.log(`   - ${config.slug}.js (tool logic template)`);
  console.log(`   - README.md`);
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Implement your tool logic in ${config.slug}.js`);
  console.log(`   2. Add entry to tools.json (see existing entries for format)`);
  console.log(`   3. Test: npx serve tools/${config.slug}`);
}

main();
