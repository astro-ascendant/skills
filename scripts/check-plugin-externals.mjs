#!/usr/bin/env bun
/**
 * Guard the OpenCode plugin against host-blocked imports.
 *
 * OpenCode provides `effect` (public single-level `effect/*` subpaths only)
 * and `@opencode/plugin` at runtime and redirects those imports to the host
 * instance. Anything resolving to a private `effect/dist/*` path fails the
 * whole plugin load with:
 *
 *   Cannot load "effect/dist/..." from plugin node_modules ...
 *
 * In practice this means:
 *
 *   1. Plugin sources must never import an `@effect/platform-*` barrel or
 *      any deep `effect/x/y` specifier. The barrels re-export
 *      socket/cluster modules (e.g. NodeAddressResolver, BunSocketServer)
 *      that import private `effect/net/*`, `effect/socket/*`, ... paths.
 *      Import Bun* layers via direct subpaths
 *      (`@effect/platform-bun/BunFileSystem`, `BunPath`, `BunRuntime`),
 *      whose transitive imports stay within public `effect/*` subpaths.
 *      Never import `@effect/platform-node-shared` directly: Bun re-exports
 *      the two safe Node implementations, so the shared package is only a
 *      transitive dependency.
 *   2. `effect` and `@opencode/*` must be peer-only (never `dependencies`)
 *      in the publishable `packages/opencode-ascendant` manifest and in the
 *      local `.opencode` container, so no second Effect copy ships with the
 *      plugin.
 *
 * Run: `bun scripts/check-plugin-externals.mjs` (or `bun run check:plugin`).
 * No dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const BUN_BARREL = "@effect/platform-bun";
const NODE_SHARED = "@effect/platform-node-shared";

// Direct Bun subpaths whose resolved dist closure is known to stay within
// public single-level `effect/*` subpaths (verified: thin re-exports of safe
// shared implementations). Anything else is rejected. NOTE: BunPath is
// deliberately absent: it re-exports NodePath, which does
// `import { make } from "effect/Path"`, and the host's effect has no `make`
// export, so importing it fails the whole plugin load.
const ALLOWED_BUN_SUBPATHS = new Set(["BunFileSystem", "BunRuntime"]);

// TS sources reachable from the plugin entrypoint (tests excluded).
const SOURCE_DIRS = [
  path.join(ROOT_DIR, ".opencode", "plugins", "ascendant"),
  path.join(ROOT_DIR, "skills", "ascendant", "tools"),
  path.join(ROOT_DIR, "packages", "opencode-ascendant", "plugin"),
  path.join(ROOT_DIR, "packages", "opencode-ascendant", "skills", "ascendant", "tools"),
];

// Command-line entry points. They ship inside the skill copy but the plugin
// never imports them, so the host never loads them: they may use platform
// layers (BunServices) and `effect/cli` that plugin sources must avoid.
// `toolkit.ts` is the `effect/ai` wrapper: the host does not serve `effect/ai`,
// so plugin sources must import `tool-specs.ts` and `workflows.ts` instead.
const CLI_ONLY_FILES = new Set(["ascendant.ts", "cli.ts", "toolkit.ts"]);
const CLI_ONLY_SPECIFIER = /(^|\/)(ascendant|cli|toolkit)\.ts$/;

// Manifests where host-provided modules must be peer-only.
const PEER_ONLY_MANIFESTS = ["packages/opencode-ascendant/package.json", ".opencode/package.json"];
const PEER_ONLY = ["effect", "@opencode/plugin", "@opencode/schema"];

const failures = [];

function listTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts") &&
      !(CLI_ONLY_FILES.has(entry.name) && dir.includes(`${path.sep}tools`))
    )
      out.push(full);
  }
  return out;
}

function checkSources() {
  for (const dir of SOURCE_DIRS) {
    for (const file of listTsFiles(dir)) {
      const rel = path.relative(ROOT_DIR, file);
      const text = fs.readFileSync(file, "utf-8");
      for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
        const spec = match[1];
        if (spec === BUN_BARREL || spec.startsWith(`${BUN_BARREL}/internal`)) {
          failures.push(
            `${rel}: imports "${spec}"; use a direct subpath (e.g. ${BUN_BARREL}/BunFileSystem) so private effect/dist/* modules stay out of the plugin graph`,
          );
        }
        if (spec === NODE_SHARED || spec.startsWith(`${NODE_SHARED}/`)) {
          failures.push(
            `${rel}: imports "${spec}"; import the Bun re-export (${BUN_BARREL}/<SubModule>) instead; ${NODE_SHARED} is transitive-only`,
          );
        }
        const bunSub = spec.match(/^@effect\/platform-bun\/([^"']+)$/);
        if (bunSub && !ALLOWED_BUN_SUBPATHS.has(bunSub[1])) {
          failures.push(
            `${rel}: imports "${spec}"; only ${[...ALLOWED_BUN_SUBPATHS].map((s) => `${BUN_BARREL}/${s}`).join(", ")} are verified host-safe`,
          );
        }
        if (spec === "effect/ai" || spec === "effect/cli") {
          failures.push(
            `${rel}: imports "${spec}"; the OpenCode host does not serve it, so only CLI-only files may use it`,
          );
        }
        if (CLI_ONLY_SPECIFIER.test(spec) && !CLI_ONLY_FILES.has(path.basename(file))) {
          failures.push(
            `${rel}: imports "${spec}", a CLI-only file; plugin code must use tool-specs.ts and workflows.ts`,
          );
        }
        const effectDeep = spec.match(/^effect\/([^"']*\/[^"']*)$/);
        if (effectDeep) {
          failures.push(
            `${rel}: imports "${spec}"; OpenCode only provides public single-level effect/* subpaths; "${spec}" resolves to a blocked effect/dist/* file`,
          );
        }
      }
      for (const match of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = match[1];
        if (spec === BUN_BARREL) {
          failures.push(
            `${rel}: dynamic import of "${spec}" barrel; import ${BUN_BARREL}/<SubModule> directly`,
          );
        }
        if (spec === NODE_SHARED || spec.startsWith(`${NODE_SHARED}/`)) {
          failures.push(
            `${rel}: dynamic import of "${spec}"; import the Bun re-export (${BUN_BARREL}/<SubModule>) instead`,
          );
        }
        if (/^effect\/[^"']*\/[^"']*$/.test(spec)) {
          failures.push(
            `${rel}: dynamic import of "${spec}"; OpenCode only provides public single-level effect/* subpaths`,
          );
        }
      }
    }
  }
}

function checkManifests() {
  for (const rel of PEER_ONLY_MANIFESTS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, rel), "utf-8"));
    const deps = manifest.dependencies ?? {};
    for (const name of PEER_ONLY) {
      if (name in deps) {
        failures.push(
          `${rel}: "${name}" is a runtime dependency; it must be peer-only (provided by the OpenCode host)`,
        );
      }
    }
    const peers = manifest.peerDependencies ?? {};
    for (const name of PEER_ONLY) {
      if (!(name in peers)) {
        failures.push(`${rel}: "${name}" missing from peerDependencies`);
      }
    }
  }
}

/**
 * Verify the resolved dist closure of every directly-imported
 * `@effect/platform-bun/<Sub>` module: follow relative imports and
 * `@effect/platform-node-shared/<Sub>` re-exports, and fail on any deep
 * `effect/x/y` specifier, which the host blocks. This catches regressions
 * introduced by upgrading the dependency even when sources only use direct
 * subpaths.
 */
function checkDistClosure() {
  const bunDist = path.join(
    ROOT_DIR,
    ".opencode",
    "node_modules",
    "@effect",
    "platform-bun",
    "dist",
  );
  const sharedDist = path.join(
    ROOT_DIR,
    ".opencode",
    "node_modules",
    "@effect",
    "platform-node-shared",
    "dist",
  );
  if (!fs.existsSync(bunDist)) {
    failures.push(
      ".opencode/node_modules/@effect/platform-bun/dist is missing; run install in .opencode first",
    );
    return;
  }
  const roots = new Set();
  for (const dir of SOURCE_DIRS.slice(0, 2)) {
    for (const file of listTsFiles(dir)) {
      const text = fs.readFileSync(file, "utf-8");
      for (const match of text.matchAll(/["']@effect\/platform-bun\/([^"']+)["']/g)) {
        roots.add(match[1]);
      }
    }
  }
  const visited = new Set();
  const visit = (distFile) => {
    if (visited.has(distFile)) return;
    visited.add(distFile);
    const text = fs.readFileSync(distFile, "utf-8");
    for (const match of text.matchAll(/from\s+"([^"]+)"/g)) {
      const spec = match[1];
      if (spec.startsWith("./") || spec.startsWith("../")) {
        const next = path.resolve(path.dirname(distFile), spec);
        if (fs.existsSync(next)) visit(next);
      } else {
        const sharedSub = spec.match(/^@effect\/platform-node-shared\/([^"]+)$/);
        if (sharedSub) {
          const next = path.join(sharedDist, `${sharedSub[1]}.js`);
          if (fs.existsSync(next)) visit(next);
          else {
            failures.push(
              `${path.relative(ROOT_DIR, distFile)} re-exports missing "${spec}"; the direct-subpath import may be invalid`,
            );
          }
        } else if (/^effect\/[^"]*\/[^"]*$/.test(spec)) {
          failures.push(
            `${path.relative(ROOT_DIR, distFile)} imports "${spec}"; blocked by the OpenCode host (resolves to effect/dist/*)`,
          );
        }
      }
    }
  };
  for (const sub of roots) {
    const entry = path.join(bunDist, `${sub}.js`);
    if (!fs.existsSync(entry)) {
      failures.push(
        `@effect/platform-bun/${sub} does not resolve to dist/${sub}.js; the direct-subpath import may be invalid`,
      );
      continue;
    }
    visit(entry);
  }
}

checkSources();
checkManifests();
checkDistClosure();

if (failures.length > 0) {
  console.error(`\nPlugin externals check failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(
  "✓ plugin externals: no barrel/deep effect imports, effect + @opencode/* are peer-only",
);
