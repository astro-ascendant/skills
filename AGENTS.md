# AGENTS.md

Agent notes for this repo. Human docs: `README.md` (install) and `docs/RELEASE.md` (publishing).

## What this is

One Vedic-astrology skill (`ascendant`) plus plugins for Claude Code, Codex, and OpenCode.
Most of the tree is **generated**; only a few directories are hand-authored.

## Sources of truth (edit only these)

- `skills/ascendant/SKILL.src.md` builds `skills/ascendant/SKILL.md`. Keep the `.src.md` name; `npx skills` discovery relies on the literal `SKILL.md` being the built copy.
- `skills/ascendant/{instructions,references,scripts,tools,agents}/` is the skill payload, copied into plugin distributions. Tests live under the root `tests/` directory and use `@effect/vitest`: `it.effect` for anything that runs an Effect, plain `it` for pure functions. Never run them with `bun test`. Test files run one at a time (`vitest.config.ts`), because the native ephemeris crashes in parallel workers, and workers cannot `process.chdir`: a test points the tools at a temporary folder by providing `Workspace` (`tests/support.ts`).
- `.opencode/plugins/ascendant/` is the hand-written plugin.
- `scripts/*.mjs` are the build and verification tools (dependency-free).
- `packages/ascendant-skills/` is the hand-written `npx ascendant-skills install` CLI, built on `effect/cli` (Node, with `effect`, `@effect/platform-node` and `@effect/platform-node-shared` pinned exactly to 4.1.1). Its command matrix is `lib/plan.mjs` (pure, no Effect), tested by `tests/installer/`. Only its `version` is stamped by `sync-versions`.
- `docs/UPDATE_ASTRO_ASCENDANT.md` is a hand-written maintenance runbook, not generated.
- `eval/` is the evaluation harness for the judge (`eval/README.md`). It is not part of the skill payload and never ships. Datasets (`eval/data/`) and reports (`eval/reports/`) are gitignored; the harness tests build their own made-up people.

Generated, committed, never hand-edit (a rebuild overwrites them and CI fails on drift):

- `skills/ascendant/SKILL.md`
- `.claude-plugin/skills/ascendant/` (Claude Code plugin copy)
- `packages/opencode-ascendant/` (published npm package: `plugin/`, `skills/`, stamped manifests; `packages/ascendant-skills/` is not generated)
- Codex has no generated skill copy: `.codex-plugin/plugin.json` points at the canonical `skills/`. There are no per-harness copies for Cursor, Gemini, Kiro, Pi, Grok, or Antigravity; those install the canonical skill globally (`npx skills`).

## Commands

```bash
make build      # full gate: installs, version sync, rebuild, typecheck, test, lint, format:check
bun run test    # all tests with vitest (tests/ascendant, tests/eval, tests/installer)
bun run test tests/ascendant/kp-lords.test.ts      # single file
bun run test -t "sub after Ketu"                   # single test by name
bun run typecheck        # two tsc projects: skills/ascendant and .opencode
bun run lint             # oxlint
bun run format           # oxfmt, fixed file list; does not touch markdown or packages/
bun run check:plugin     # import-graph guard; CI runs it, `make build` does NOT
bun run eval --data eval/data/<name>.jsonl   # score the judge's timing against baselines
bun run eval:choices --data eval/data/<people>.jsonl --choices eval/data/<name>.choices.json   # score the promise rule on known choices
```

Rebuild after touching any source, then commit the regenerated output in the same change
(CI rebuilds and runs `git diff --exit-code`):

```bash
bun run build:skill                            # SKILL.md + Claude plugin copy
bun scripts/build-opencode-plugin.mjs          # packages/opencode-ascendant/
bun scripts/build-opencode-plugin.mjs --check  # drift check, builds to a temp dir
```

## Architecture

- `skills/ascendant/tools/*.ts` is the shared engine (Effect + `astro-ascendant`). CLI: `bun skills/ascendant/tools/ascendant.ts <add-person|transit|ruling-planets|judge|evidence|verify|events>`.
- Each tool is defined once in `tool-specs.ts` (plain `effect` Schemas, name, description). `workflows.ts` holds one typed `Effect` per tool (typed input, `CommandError` out). `toolkit.ts` wraps the specs as an `effect/ai` Toolkit; `cli.ts` (`effect/cli`) and `ascendant.ts` are the command line. The OpenCode host does not serve `effect/ai` or `effect/cli`, so the plugin imports only `tool-specs.ts` and `workflows.ts`; `check:plugin` enforces it.
- `kp-judge.ts` is the deterministic KP judgment (promise, ranked significators, timing windows): pure functions over chart facts, with no clock, file access, or model. `judge.ts` loads a saved person and calls it. `events.ts` holds the house groups from `references/kp/house-grouping.md` as data; `tests/ascendant/kp-events.test.ts` fails when the two disagree, so edit both together. A rule the guidebook does not state is an engine choice: it has an id in `EngineChoice` and a one-line statement in `ENGINE_CHOICES` (both in `kp-judge.ts`), the code that applies it is named after the id, and `ascendant events` lists them. Every rule a judgment fires carries a typed `source`: `Guidebook` with file and section, or `Engine` with the choice id. Add a choice there, never as a comment. `memory.ts` parses a person's `MEMORY.md`: one event per line, oldest first, as `* <date> - <event>` (date `DD Mon YYYY` or `Mon YYYY`; an event id may lead the text as `#<event-id>`; the older `- [DD/MM/YYYY] #<event-id>: message` form still parses), giving tagged events and untagged dated notes, which `evidence` also returns as facts and `kp-hindcast.ts` checks the rules and the birth time against them; an empty memory is valid and the judge then works from the chart alone.
- Person records resolve against the `Workspace` reference in `common.ts`, which defaults to the current directory. Build person paths from `personsDirectory`, never from a bare `"persons"`.
- `.opencode/plugins/ascendant/` imports the engine as `../../../skills/ascendant/tools/*.ts`. `build-opencode-plugin.mjs` rewrites that prefix to `../skills` in the package, so keep the repo-relative form when editing plugin sources.
- OpenCode registers the skill, the `/ascendant` command, and every tool in `tool-specs.ts` programmatically. It reads `skills/ascendant/SKILL.md` at runtime, so there is no OpenCode skill copy to regenerate.
- `skills/ascendant/scripts/ascendant.sh` copies an **explicit allowlist** of tool files into `./.ascendant-agent/` in the user's cwd. Any new file under `tools/` must be added there or the runtime copy will silently miss it.
- Person records are written to `./persons/<name>/` in the user's cwd (gitignored). Never commit them.
- `./.ascendant/` in the user's cwd is scratch space for agent scripts and draft answers. `runtime.sh` creates it self-ignored with `*`; never commit it.
- The skill never asks the user for a school, and the model does the judging. `SKILL.src.md` routes by question: a specific matter (whether, when, which kind) goes to `instructions/reading.md`, a broad outlook to `instructions/parashari.md`. In a reasoned reading the model calls `evidence` for chart facts from both schools, weighs them with the guidebook, narrows the timing level by level (bhukti, antara, sookshma), lays two to four candidate periods side by side with `evidence --compare`, rates each on chart evidence and on ordinary life as two separate scales, chooses by a fixed rule (ordinary life removes the impossible and holds back the unusual; the chart ranks the rest; typical earns nothing), commits to an answer, and passes the draft and its worksheet through `verify`. Code computes and checks; it never decides.
- Each school has its own Vimshottari calendar (KP ayanamsa and Lahiri differ, so periods fall some weeks apart). Period ids carry the calendar (`kp:Mars-Rahu`, `par:Mars-Rahu`) and are never bare. A slow transit names its house in both systems (whole-sign and Placidus).
- `evidence.ts` holds the pure fact builders (every fact has an id), and `dossier.ts` loads a person and runs `evidence` and `verify`. `verify-answer.ts` is the pure check: every cited fact id and period id must exist for the person, every date in the draft must fall in a chosen period or be a recorded date, Parashari leads every part that is not about timing (such a part must cite Parashari facts, and confidence above low needs a second source), a timed part needs facts from both schools for confidence above low, high needs a recorded event, timing without a date is refused, each part needs a line of reasoning, a part that picks a period needs at least two rated candidates with exactly one chosen by that rule, the candidates must include one from every larger period in the stretch the part says it searched (`evidence` returns that shortlist), a candidate dated by one school's calendar may cite only that school's facts, plus the disclaimer, certainty wording and wording about how the answer was produced (the answer is first person, astrologer to user).
- `judge` remains as the strict KP rule set. Its promise rule appears in the evidence as one fact (`kp.rule.<event>`). The evaluations in `eval/` show it does not beat chance when read alone, so nothing should present it as the answer.

## Effect and plugin landmines

- The OpenCode v2 host runs `effect` 4.0.0-beta and only serves public single-level `effect/*` subpaths.
- Never import the `@effect/platform-bun` barrel. Use direct subpaths such as `@effect/platform-bun/BunFileSystem`; `check:plugin` rejects the barrel and deep paths.
- `BunPath` fails the entire plugin load (the host's `effect/Path` has no `make`). Use the local layer in `skills/ascendant/tools/path.ts`; the header explains why.
- `.opencode/package.json` pins exact versions and overrides `effect` to 4.1.1, and `skills/ascendant/scripts/setup.sh` pins the same versions for user installs. Bump them together, then refresh both lockfiles (`bun install` at root and inside `.opencode/`). `packages/ascendant-skills/package.json` pins the same `effect` version and must move with them. It also pins `@effect/platform-node-shared` directly: `@effect/platform-node` only asks for `^x.y.z`, so a fresh `npx` install otherwise pulls a newer shared release built for a newer `effect` and the CLI fails to load. Import `@effect/platform-node` by subpath (`/NodeRuntime`, `/NodeServices`), never the barrel. Before publishing, `bun pm pack` the package and run it from a fresh install; the workspace resolves differently.

## Release

- Version source of truth is the root `package.json`. `bun run sync-versions` stamps `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `.opencode/package.json`, then rebuilds everything.
- Flow: add a changeset, `make version`, set the root version, `make build`, commit and push `main`.
- **Ask the user before pushing a release tag.** `git push origin opencode-ascendant-vX.Y.Z` publishes to npm and creates the GitHub Release. The tag must equal the package version; CI enforces it.
- Commit style from history: conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `style:`), scoped where useful.

## Style

- No em dashes or en dashes anywhere in this repo. Use `:`, `;`, `-`, or parentheses.
- Markdown tables use `-` in empty cells.
