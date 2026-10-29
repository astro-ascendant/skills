#!/usr/bin/env node
/**
 * `npx ascendant-skills install`: detect coding tools, ask project or
 * global, then install the ascendant plugin (Claude Code, Codex, OpenCode)
 * or skill (everything else) into each. Built on effect/cli; Node >= 18.
 *
 * The command matrix lives in ../lib/plan.mjs; this file only probes the
 * machine, prompts, and runs the plan.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Console, Effect, Option } from "effect";
import { CliError, Command, Flag, Prompt } from "effect/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
// Subpaths, not the barrel: the barrel also loads the socket and HTTP modules,
// which this CLI never uses. package.json pins @effect/platform-node-shared so
// a fresh install cannot pair it with a newer, incompatible shared release.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { PROVIDERS, SCOPES, detectProviders, parseProviders, planInstall } from "../lib/plan.mjs";

const IS_WINDOWS = process.platform === "win32";
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf-8"),
);

const BIN_NAMES = [...new Set([...PROVIDERS.flatMap((p) => p.bins), "npx"])];
const HOME_DIRS = [...new Set(PROVIDERS.flatMap((p) => p.homeDirs))];

/** Probe PATH and the home directory once; the plan reads the results synchronously. */
const detectMachine = Effect.sync(() => {
  const exts = IS_WINDOWS ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const bins = new Set(
    BIN_NAMES.filter((name) =>
      dirs.some((dir) => exts.some((ext) => existsSync(path.join(dir, name + ext)))),
    ),
  );
  const homeDirs = new Set(HOME_DIRS.filter((rel) => existsSync(path.join(homedir(), rel))));
  return {
    hasBin: (name) => bins.has(name),
    hasHomeDir: (rel) => homeDirs.has(rel),
  };
});

const opencodeMajor = (machine) =>
  Effect.gen(function* () {
    if (!machine.hasBin("opencode")) return undefined;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const out = yield* spawner
      .string(ChildProcess.make("opencode", ["--version"], { shell: IS_WINDOWS }))
      .pipe(Effect.orElseSucceed(() => ""));
    const match = /(\d+)\.\d+/.exec(out);
    return match ? Number(match[1]) : undefined;
  });

/** Run one plan step with inherited stdio. A missing CLI counts as a failure. */
const runStep = (step) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    // Windows CLIs (claude, npx, ...) are .cmd shims that need a shell. Every
    // argument comes from plan.mjs constants, so nothing user-supplied is
    // interpolated into the shell line.
    const code = yield* spawner.exitCode(
      ChildProcess.make(step.command, step.args, {
        shell: IS_WINDOWS,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    return code === 0;
  }).pipe(Effect.orElseSucceed(() => false));

const userError = (message) => new CliError.UserError({ cause: message });

const parseProvidersOrFail = (raw) =>
  Effect.try({
    try: () => parseProviders(raw),
    catch: (error) => userError(error instanceof Error ? error.message : String(error)),
  });

/**
 * Fill in providers and scope. Flags win; anything missing is asked for only
 * on an interactive terminal without `--yes`, otherwise the defaults apply.
 * `providersFlag` is the raw `--providers` value, parsed here.
 */
const choose = ({ providersFlag, scope, yes, detected }) =>
  Effect.gen(function* () {
    const interactive = !yes && process.stdin.isTTY;
    if (!interactive) {
      const providers =
        providersFlag === undefined ? detected : yield* parseProvidersOrFail(providersFlag);
      return { providers, scope: scope ?? "global" };
    }

    // Every tool is listed; the detected ones start checked.
    const providers =
      providersFlag === undefined
        ? yield* Prompt.run(
            Prompt.MultiSelect({
              message: "Install for which tools?",
              choices: PROVIDERS.map((p) => ({
                title: p.name,
                value: p.id,
                description: detected.includes(p.id) ? "detected" : undefined,
                selected: detected.includes(p.id),
              })),
              min: 1,
              // Room for every tool plus the select-all and inverse rows.
              maxPerPage: PROVIDERS.length + 2,
            }),
          )
        : yield* parseProvidersOrFail(providersFlag);

    const chosenScope =
      scope ??
      (yield* Prompt.run(
        Prompt.Select({
          message: "Install for this project or globally?",
          choices: [
            { title: "Globally", value: "global", description: "For every project" },
            { title: "This project", value: "project", description: "Only the current directory" },
          ],
        }),
      ));

    return { providers, scope: chosenScope };
  });

const install = Command.make(
  "install",
  {
    providers: Flag.optional(
      Flag.String("providers").pipe(
        Flag.withDescription(
          `Comma-separated tools, or "all" (default: detected). Ids: ${PROVIDERS.map((p) => p.id).join(", ")}`,
        ),
      ),
    ),
    scope: Flag.optional(
      Flag.Literals("scope", SCOPES).pipe(
        Flag.withDescription("project | global (default: asks; global with --yes)"),
      ),
    ),
    yes: Flag.Boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDefault(false),
      Flag.withDescription("Skip prompts and use the defaults"),
    ),
    dryRun: Flag.Boolean("dry-run").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print the commands without running them"),
    ),
  },
  ({ providers, scope, yes, dryRun }) =>
    Effect.gen(function* () {
      const machine = yield* detectMachine;
      const detected = detectProviders(machine);
      const choice = yield* choose({
        providersFlag: Option.getOrUndefined(providers),
        scope: Option.getOrUndefined(scope),
        yes,
        detected,
      });
      if (choice.providers.length === 0) {
        return yield* Effect.fail(
          userError(
            "Nothing to install. Pass --providers=<ids>, for example --providers=claude,cursor.",
          ),
        );
      }

      const { steps, notes } = planInstall({
        providers: choice.providers,
        scope: choice.scope,
        hasBin: machine.hasBin,
        opencodeMajor: yield* opencodeMajor(machine),
      });
      yield* Console.log(
        `\nInstalling ascendant (${choice.scope}) for: ${choice.providers.join(", ")}\n`,
      );

      const failed = [];
      for (const step of steps) {
        yield* Console.log(`→ ${step.label}\n  $ ${[step.command, ...step.args].join(" ")}`);
        if (dryRun) continue;
        if (!(yield* runStep(step))) failed.push(step.label);
      }

      for (const note of notes) yield* Console.log(`\nNote: ${note}`);
      if (failed.length > 0) {
        return yield* Effect.fail(userError(`Failed: ${failed.join("; ")}`));
      }
      if (!dryRun) {
        yield* Console.log(
          "\nDone. Restart your tool, then run /ascendant (Codex: $ascendant) with your birth details.",
        );
      }
    }),
).pipe(
  Command.withDescription(
    "Install the Ascendant Vedic astrology skill and plugins into your coding tools.",
  ),
);

const root = Command.make("ascendant-skills").pipe(
  Command.withDescription(
    "Install the Ascendant Vedic astrology skill and plugins into your coding tools.",
  ),
  Command.withSubcommands([install]),
);

Command.runWith(root, { version: PKG.version })(process.argv.slice(2)).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
