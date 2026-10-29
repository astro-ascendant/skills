#!/usr/bin/env node
/**
 * `npx ascendant-skills install`: detect coding tools, ask project or
 * global, then install the ascendant plugin (Claude Code, Codex, OpenCode)
 * or skill (everything else) into each. Dependency-free; Node >= 18.
 *
 * The command matrix lives in ../lib/plan.mjs; this file only probes the
 * machine, prompts, and runs the plan.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  PROVIDERS,
  detectProviders,
  parseArgs,
  parseProviders,
  planInstall,
} from "../lib/plan.mjs";

const IS_WINDOWS = process.platform === "win32";
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf-8"),
);

const HELP = `ascendant-skills v${PKG.version}

Install the Ascendant Vedic astrology skill and plugins into your coding tools.

Usage:
  npx ascendant-skills install [options]

Options:
  --providers=<ids>   Comma-separated tools, or "all" (default: detected)
                      ${PROVIDERS.map((p) => p.id).join(", ")}
  --scope=<scope>     project | global (default: asks; global with --yes)
  -y, --yes           Skip prompts and use the defaults
  --dry-run           Print the commands without running them
  -h, --help          Show this help
`;

function hasBin(name) {
  const exts = IS_WINDOWS ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return dirs.some((dir) => exts.some((ext) => existsSync(path.join(dir, name + ext))));
}

function hasHomeDir(rel) {
  return existsSync(path.join(homedir(), rel));
}

function opencodeMajor() {
  if (!hasBin("opencode")) return undefined;
  const out = spawnSync("opencode", ["--version"], { encoding: "utf-8", shell: IS_WINDOWS });
  const match = /(\d+)\.\d+/.exec(out.stdout ?? "");
  return match ? Number(match[1]) : undefined;
}

async function ask(rl, question, fallback) {
  const answer = (await rl.question(question)).trim();
  return answer === "" ? fallback : answer;
}

async function choose(opts, detected) {
  const interactive = !opts.yes && process.stdin.isTTY;
  let { providers, scope } = opts;

  if (!interactive) {
    return { providers: providers ?? detected, scope: scope ?? "global" };
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!providers) {
      const names = detected.map((id) => PROVIDERS.find((p) => p.id === id).name);
      console.log(
        detected.length > 0 ? `Detected: ${names.join(", ")}` : "No coding tools detected.",
      );
      const raw = await ask(
        rl,
        `Install for which tools? [${detected.length > 0 ? detected.join(",") : "e.g. claude,cursor"}] `,
        detected.join(","),
      );
      providers = raw === "" ? [] : parseProviders(raw);
    }
    if (!scope) {
      const raw = await ask(
        rl,
        "Install for this project or globally? (project/global) [global] ",
        "global",
      );
      scope = raw.toLowerCase().startsWith("p") ? "project" : "global";
    }
  } finally {
    rl.close();
  }
  return { providers, scope };
}

function run(step) {
  // Windows CLIs (claude, npx, ...) are .cmd shims that need a shell. Every
  // argument comes from plan.mjs constants, so nothing user-supplied is
  // interpolated into the shell line.
  const result = spawnSync(step.command, step.args, { stdio: "inherit", shell: IS_WINDOWS });
  return result.status === 0;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts.command === undefined) {
    console.log(HELP);
    return opts.help ? 0 : 1;
  }
  if (opts.command !== "install") {
    console.error(`Unknown command: ${opts.command}\n\n${HELP}`);
    return 1;
  }

  const detected = detectProviders({ hasBin, hasHomeDir });
  const { providers, scope } = await choose(opts, detected);
  if (providers.length === 0) {
    console.error(
      "Nothing to install. Pass --providers=<ids>, for example --providers=claude,cursor.",
    );
    return 1;
  }

  const { steps, notes } = planInstall({
    providers,
    scope,
    hasBin,
    opencodeMajor: opencodeMajor(),
  });
  console.log(`\nInstalling ascendant (${scope}) for: ${providers.join(", ")}\n`);

  const failed = [];
  for (const step of steps) {
    console.log(`→ ${step.label}\n  $ ${[step.command, ...step.args].join(" ")}`);
    if (opts.dryRun) continue;
    if (!run(step)) failed.push(step.label);
  }

  for (const note of notes) console.log(`\nNote: ${note}`);
  if (failed.length > 0) {
    console.error(`\nFailed: ${failed.join("; ")}`);
    return 1;
  }
  if (!opts.dryRun) {
    console.log(
      "\nDone. Restart your tool, then run /ascendant (Codex: $ascendant) with your birth details.",
    );
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
