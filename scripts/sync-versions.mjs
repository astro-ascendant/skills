#!/usr/bin/env bun
/**
 * Unified build: match every distributed version to package.json, then
 * rebuild every generated artifact from source.
 *
 * Source of truth for the release version is the root `package.json`
 * (bumped by `changeset version`). This script stamps that version into:
 *
 *   plugin.json, .claude-plugin/plugin.json, .codex-plugin/plugin.json,
 *   .opencode/package.json, packages/ascendant-skills/package.json
 *
 * and then rebuilds:
 *
 *   - harness skill copies via scripts/build-skill.mjs
 *     (skills/ascendant/SKILL.md is the canonical copy; the SKILL version
 *     comes from plugin.json, synced above)
 *   - the publishable opencode-ascendant npm package via
 *     scripts/build-opencode-plugin.mjs (stamps its own version plus
 *     dependency pins from the manifests)
 *
 * Claude Code (.claude-plugin/) and Codex (.codex-plugin/) plugins are
 * manifest-only distributions: they need the version stamp but no build
 * step of their own.
 *
 * Run: `bun scripts/sync-versions.mjs` (also runs automatically after
 * `changeset version` via the `version` npm script, and via `make build-all`).
 * No dependencies.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

// Manifest path (relative to repo root), JSON indent width, and the key
// holding the version. Every entry below tracks the root version exactly.
const VERSIONED_MANIFESTS = [
  { file: "plugin.json", indent: 2 },
  { file: ".claude-plugin/plugin.json", indent: 2 },
  { file: ".codex-plugin/plugin.json", indent: 2 },
  { file: ".opencode/package.json", indent: 2 },
  { file: "packages/ascendant-skills/package.json", indent: 2 },
];

const pkgPath = path.join(ROOT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
if (!pkg.version) throw new Error("package.json must declare `version`");

for (const { file, indent } of VERSIONED_MANIFESTS) {
  const manifestPath = path.join(ROOT_DIR, file);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (manifest.version !== pkg.version) manifest.version = pkg.version;
  // Always rewrite: normalizes indent even when the version already matches.
  const text = `${JSON.stringify(manifest, null, indent)}\n`;
  const current = fs.readFileSync(manifestPath, "utf-8");
  if (current !== text) {
    fs.writeFileSync(manifestPath, text);
    console.log(`✓ ${file} updated → ${pkg.version}`);
  } else {
    console.log(`✓ ${file} already at ${pkg.version}`);
  }
}

execFileSync("bun", [path.join(ROOT_DIR, "scripts", "build-skill.mjs")], {
  cwd: ROOT_DIR,
  stdio: "inherit",
});

execFileSync("bun", [path.join(ROOT_DIR, "scripts", "build-opencode-plugin.mjs")], {
  cwd: ROOT_DIR,
  stdio: "inherit",
});

console.log(`\nAll distributions at v${pkg.version}.`);
