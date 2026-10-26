#!/usr/bin/env bun
/**
 * Build ascendant skill distribution from a single source of truth.
 *
 * Source:  skills/ascendant/SKILL.src.md (+ instructions/, references/,
 *          scripts/, tools/, agents/)
 * Outputs: skills/ascendant/SKILL.md (canonical, full frontmatter) and the
 *          Claude Code plugin copy at .claude-plugin/skills/ascendant/.
 *
 * There are no per-harness copies. Every harness installs the skill from a
 * real distribution channel instead:
 *
 *   - `npx skills add astro-ascendant/skills --skill ascendant` reads the
 *     canonical dir;
 *   - Codex reads the canonical dir through `.codex-plugin/plugin.json`
 *     (`"skills": "./skills/"`);
 *   - Claude Code reads its own plugin copy, which this script writes;
 *   - OpenCode registers skill, /ascendant command, and tools from the Effect
 *     plugin at `.opencode/plugins/ascendant/` (see that plugin's source).
 *
 * Committed `.claude/`, `.cursor/`, `.gemini/`, `.kiro/`, `.pi/`, `.grok/`,
 * and `.agent/` trees were removed: they duplicated ~2.1k lines each with no
 * install path pointing at them, and global skill installs already cover
 * those harnesses.
 *
 * Why SKILL.src.md? The `npx skills` CLI discovers a skill by finding a
 * literal SKILL.md and copies that directory verbatim. If the source file
 * were named SKILL.md, the CLI would install the raw source. Naming it
 * SKILL.src.md hides it from discovery so installs resolve to a compiled
 * copy instead (same trick as impeccable's skill/SKILL.src.md).
 *
 * Frontmatter varies per provider: the canonical and Claude copies carry
 * `name` + `description` + `version` + `license` + `metadata` plus
 * `user-invocable` / `argument-hint`. `license` and `metadata` come from the
 * Agent Skills spec; `user-invocable` and `argument-hint` are Claude Code
 * extensions that Claude Code documents and other harnesses ignore, so the
 * canonical copy can carry all six safely.
 * The body stays byte-identical: the `<skill-dir>` token is resolved by the
 * agent at runtime to the directory holding SKILL.md, so it is portable.
 *
 * Version is read from the portable root plugin.json. Codex loads via the
 * portable root; only the .codex-plugin marketplace shim keeps its own
 * `interface` manifest.
 *
 * Run: `bun scripts/build-skill.mjs` (or `bun run build:skill`).
 * No dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "skills", "ascendant");
const SRC_FILE = path.join(SOURCE_DIR, "SKILL.src.md");

// Subtrees mirrored into the Claude plugin copy (SKILL.src.md excluded).
const SOURCE_SUBTREES = ["instructions", "references", "scripts", "tools", "agents"];

/**
 * Provider table. configDir is the harness dot-directory; fields lists the
 * optional frontmatter keys emitted beyond name/description/version.
 * Every plugin-backed distribution that owns a skill copy belongs here;
 * global skill installs and the OpenCode/Codex plugins need no entry.
 */
const PROVIDERS = {
  "claude-plugin": {
    configDir: ".claude-plugin",
    displayName: "Claude Plugin",
    fields: ["user-invocable", "argument-hint"],
  },
};

function parseScalar(value) {
  if (/^(".*"|'.*')$/.test(value)) return value.slice(1, -1);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter = {};
  // Key of a `key:` line with an empty value. Only becomes a nested map when
  // indented lines follow it, so `key: ""` keeps reading as an empty string.
  let parent = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s+\S/.test(line)) {
      const colon = line.indexOf(":");
      if (colon <= 0 || parent === null) continue;
      if (typeof frontmatter[parent] !== "object") frontmatter[parent] = {};
      frontmatter[parent][line.slice(0, colon).trim()] = parseScalar(line.slice(colon + 1).trim());
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    frontmatter[key] = value === "" ? "" : parseScalar(value);
    parent = value === "" ? key : null;
  }
  return { frontmatter, body: match[2].trim() + "\n" };
}

function yamlNeedsQuoting(value) {
  if (value === "") return true;
  if (/^\s|\s$/.test(value)) return true;
  if (/^[{[\],&*!|>'"%@`#?]/.test(value)) return true;
  if (/:\s|\s#|:$/.test(value)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return true;
  return false;
}

function yamlScalar(value) {
  if (typeof value === "boolean") return String(value);
  const s = String(value);
  return yamlNeedsQuoting(s) ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}

function generateFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${yamlScalar(v)}`);
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function copyDirPreservingModes(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirPreservingModes(src, dest);
    } else if (entry.isFile()) {
      if (entry.name.endsWith(".test.ts")) continue;
      fs.copyFileSync(src, dest);
      fs.chmodSync(dest, fs.statSync(src).mode & 0o777);
    }
  }
}

/**
 * Make a generated skill dir match source: write SKILL.md, then replace
 * each managed subtree wholesale so deleted source files cannot linger.
 * Only the skill dir itself is managed; sibling files (e.g.
 * .opencode/plugins/, .claude-plugin/plugin.json, hooks configs) are untouched.
 */
function mirrorSkillDir(destSkillDir, skillMd) {
  fs.mkdirSync(destSkillDir, { recursive: true });
  fs.writeFileSync(path.join(destSkillDir, "SKILL.md"), skillMd, "utf-8");
  for (const tree of SOURCE_SUBTREES) {
    const src = path.join(SOURCE_DIR, tree);
    const dest = path.join(destSkillDir, tree);
    if (!fs.existsSync(src)) {
      fs.rmSync(dest, { recursive: true, force: true });
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    copyDirPreservingModes(src, dest);
  }
}

function readSource() {
  if (!fs.existsSync(SRC_FILE)) throw new Error(`Source of truth missing: ${SRC_FILE}`);
  const { frontmatter, body } = parseFrontmatter(fs.readFileSync(SRC_FILE, "utf-8"));
  if (!frontmatter.name) throw new Error("SKILL.src.md must declare `name`");
  if (!frontmatter.description) throw new Error("SKILL.src.md must declare `description`");
  if (frontmatter.description.length > 1024) {
    throw new Error(`description exceeds 1024 chars (${frontmatter.description.length})`);
  }
  return { frontmatter, body };
}

function readSkillsVersion() {
  const pluginJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "plugin.json"), "utf-8"));
  if (!pluginJson.version) throw new Error("plugin.json must declare `version`");
  return pluginJson.version;
}

function buildSkillMarkdown(frontmatter, body, { fields, version }) {
  const out = { name: frontmatter.name, description: frontmatter.description };
  if (version) out.version = version;
  if (frontmatter.license) out.license = frontmatter.license;
  if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
    out.metadata = frontmatter.metadata;
  }
  if (fields.includes("user-invocable") && frontmatter["user-invocable"])
    out["user-invocable"] = true;
  if (
    fields.includes("argument-hint") &&
    frontmatter["user-invocable"] &&
    frontmatter["argument-hint"]
  ) {
    out["argument-hint"] = frontmatter["argument-hint"];
  }
  return `${generateFrontmatter(out)}\n\n${body}`;
}

function build() {
  const { frontmatter, body } = readSource();
  const version = readSkillsVersion();

  // 1. Canonical copy: skills/ascendant/SKILL.md (full frontmatter for the
  // Claude plugin at .claude-plugin/plugin.json -> ./skills/ascendant and
  // for `npx skills add`, which copies this directory verbatim). The source
  // dir IS the canonical dir, so only SKILL.md is written here; subtrees
  // are already the source of truth.
  fs.writeFileSync(
    path.join(SOURCE_DIR, "SKILL.md"),
    buildSkillMarkdown(frontmatter, body, {
      fields: ["user-invocable", "argument-hint"],
      version,
    }),
    "utf-8",
  );
  console.log(`✓ canonical: skills/ascendant/SKILL.md (v${version})`);

  // 2. Plugin copies. Only distributions that own their skill tree need one.
  for (const [key, config] of Object.entries(PROVIDERS)) {
    const destSkillDir = path.join(ROOT_DIR, config.configDir, "skills", "ascendant");
    mirrorSkillDir(
      destSkillDir,
      buildSkillMarkdown(frontmatter, body, { fields: config.fields, version }),
    );
    console.log(`✓ ${config.displayName}: ${config.configDir}/skills/ascendant/ (${key})`);
  }

  console.log("✓ Codex: canonical skills/ via .codex-plugin/plugin.json (no generated copy)");
  console.log(
    "✓ OpenCode: skill/command/tools via .opencode/plugins/ascendant/ (no generated copy)",
  );

  console.log(
    "\nBuild complete. Do not hand-edit generated SKILL.md copies; edit skills/ascendant/SKILL.src.md and rebuild.",
  );
}

try {
  build();
} catch (err) {
  console.error(`\nBuild failed: ${err.message}`);
  process.exit(1);
}
