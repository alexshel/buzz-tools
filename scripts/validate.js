#!/usr/bin/env node
/**
 * Validate tools.json against portal.config.json (and itself).
 * Usage: node scripts/validate.js
 * Exits 1 on errors (2 on config problems). Prints warnings but does not fail.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let errors = [];
let warnings = [];

function read(name) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) { errors.push(`Missing file: ${name}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { errors.push(`${name}: invalid JSON — ${e.message}`); return null; }
}

const toolsFile = read("tools.json");
const configFile = read("portal.config.json");

function bail(code) {
  const lines = [];
  warnings.forEach((w) => lines.push("⚠ " + w));
  errors.forEach((e) => lines.push("✖ " + e));
  if (lines.length) console.log(lines.join("\n") + "\n");
  console.log(errors.length + " error(s), " + warnings.length + " warning(s).");
  process.exit(errors.length ? 1 : warnings.length ? 2 : 0);
}

if (!toolsFile || !configFile) bail();

/* ---- catalog-level ---- */
if (typeof toolsFile.name !== "string" || !toolsFile.name) errors.push("tools.json: missing \"name\".");
if (typeof toolsFile.tagline !== "string") errors.push("tools.json: missing \"tagline\".");
const tools = Array.isArray(toolsFile.tools) ? toolsFile.tools : (errors.push("tools.json: \"tools\" must be an array."), []);

/* ---- category index (by id and by display name) ---- */
const cats = Array.isArray(configFile.categories) ? configFile.categories : (errors.push("portal.config.json: \"categories\" must be an array."), []);
const idSet = new Set(), nameSet = new Set(), fromName = new Map();
for (const c of cats) {
  if (!c || !c.id) { errors.push("portal.config.json: category without \"id\"."); continue; }
  if (idSet.has(c.id)) errors.push(`portal.config.json: duplicate category id "${c.id}".`);
  idSet.add(c.id);
  if (c.name) {
    if (nameSet.has(c.name)) errors.push(`portal.config.json: duplicate category name "${c.name}".`);
    nameSet.add(c.name);
    fromName.set(c.name, c.id);
  }
  if (c.color && !/^#[0-9a-fA-F]{3,8}$/.test(c.color)) warnings.push(`Category "${c.id}": color "${c.color}" is not a hex color.`);
  if (Array.isArray(c.subcategories)) {
    const sids = new Set();
    for (const s of c.subcategories) {
      if (!s || !s.id) { errors.push(`portal.config.json (${c.id}): subcategory without id.`); continue; }
      if (sids.has(s.id)) errors.push(`portal.config.json (${c.id}): duplicate subcategory "${s.id}".`);
      sids.add(s.id);
    }
  }
}

const STATUSES = new Set(["live", "building", "planned", "deprecated"]);
const EFFORTS = new Set(["XS", "S", "M", "L", "XL"]);

/* ---- tools ---- */
const slugs = new Set();
for (const t of tools) {
  if (!t || !t.slug) { errors.push("tools.json: tool entry without slug."); continue; }
  if (slugs.has(t.slug)) errors.push(`tools.json: duplicate slug "${t.slug}".`);
  slugs.add(t.slug);

  if (!/^[a-z0-9-]+$/.test(t.slug)) errors.push(`tools.json: slug "${t.slug}" must be lowercase alphanumeric + hyphens.`);
  ["name", "description", "icon"].forEach((f) => {
    if (typeof t[f] !== "string" || !t[f]) errors.push(`tools.json ("${t.slug}"): missing string "${f}".`);
  });

  const cat = t.category;
  if (!cat) errors.push(`tools.json ("${t.slug}"): missing "category".`);
  else if (!idSet.has(cat) && !fromName.has(cat)) {
    errors.push(`tools.json ("${t.slug}"): category "${cat}" does not exist in portal.config.json.`);
  }

  if (t.status && !STATUSES.has(t.status)) errors.push(`tools.json ("${t.slug}"): unknown status "${t.status}".`);
  if (t.estimatedEffort && !EFFORTS.has(t.estimatedEffort)) errors.push(`tools.json ("${t.slug}"): estimatedEffort must be one of XS|S|M|L|XL (got "${t.estimatedEffort}").`);
  if (t.priority != null && (typeof t.priority !== "number" || t.priority < 0)) errors.push(`tools.json ("${t.slug}"): priority must be a non-negative number.`);
  if (t.tags != null && (!Array.isArray(t.tags) || t.tags.some((x) => typeof x !== "string"))) errors.push(`tools.json ("${t.slug}"): tags must be an array of strings.`);
  if (t.seo != null && (typeof t.seo !== "object" || Array.isArray(t.seo))) errors.push(`tools.json ("${t.slug}"): seo must be an object.`);
}

/* ---- config cross-refs ---- */
function sectionToolIds() {
  const ids = [];
  const secs = configFile.homepage && Array.isArray(configFile.homepage.sections) ? configFile.homepage.sections : [];
  for (const s of secs) if (s && Array.isArray(s.toolIds)) ids.push(...s.toolIds);
  return ids;
}
for (const id of sectionToolIds()) {
  if (!slugs.has(id)) warnings.push(`portal.config.json: featured/tool id "${id}" has no tool in tools.json (will render empty).`);
}

/* ---- analytics schema ---- */
const an = configFile.analytics;
if (an) {
  if (typeof an.enabled !== "boolean") errors.push('portal.config.json: analytics.enabled must be a boolean.');
  else if (an.enabled === true) {
    if (typeof an.endpoint !== "string" || !/^https?:\/\//.test(an.endpoint)) {
      warnings.push('portal.config.json: analytics is enabled but endpoint is missing/not http(s) — events are buffered locally and never sent.');
    }
  }
}

if (!configFile.search || configFile.search.enabled !== false) {
  if (configFile.search && configFile.search.engine && configFile.search.engine !== "fusejs") {
    errors.push(`portal.config.json: unsupported search engine "${configFile.search.engine}".`);
  }
}

bail();
