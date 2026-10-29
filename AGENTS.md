# AGENTS.md

Agent notes for this repo. Human docs: `README.md` (install) and `RELEASE.md` (publishing).

## What this is

One Vedic-astrology skill (`ascendant`) plus plugins for Claude Code, Codex, and OpenCode.
Most of the tree is **generated**; only a few directories are hand-authored.

## Sources of truth (edit only these)

- `skills/ascendant/SKILL.src.md` builds `skills/ascendant/SKILL.md`. Keep the `.src.md` name; `npx skills` discovery relies on the literal `SKILL.md` being the built copy.
- `skills/ascendant/{instructions,references,scripts,tools,agents}/` is the skill payload, copied into plugin distributions. Tests live under the root `tests/` directory.
- `.opencode/plugins/ascendant/` is the hand-written plugin.
- `scripts/*.mjs` are the build and verification tools (dependency-free).
- `packages/ascendant-skills/` is the hand-written `npx ascendant-skills install` CLI, built on `effect/cli` (Node, with `effect` and `@effect/platform-node` pinned exactly to 4.0.5). Its command matrix is `lib/plan.mjs` (pure, no Effect), tested by `tests/installer/`. Only its `version` is stamped by `sync-versions`.
- `UPDATE_ASTRO_ASCENDANT.md` is a hand-written maintenance runbook, not generated.

Generated, committed, never hand-edit (a rebuild overwrites them and CI fails on drift):

- `skills/ascendant/SKILL.md`
- `.claude-plugin/skills/ascendant/` (Claude Code plugin copy)
- `packages/opencode-ascendant/` (published npm package: `plugin/`, `skills/`, stamped manifests; `packages/ascendant-skills/` is not generated)
- Codex has no generated skill copy: `.codex-plugin/plugin.json` points at the canonical `skills/`. There are no per-harness copies for Cursor, Gemini, Kiro, Pi, Grok, or Antigravity; those install the canonical skill globally (`npx skills`).

## Commands

```bash
make build      # full gate: installs, version sync, rebuild, typecheck, test, lint, format:check
bun test        # all tests (tests/ascendant and tests/installer)
bun test tests/ascendant/kp-lords.test.ts          # single file
bun test -t "sub after Ketu"                       # single test by name
bun run typecheck        # two tsc projects: skills/ascendant and .opencode
bun run lint             # oxlint
bun run format           # oxfmt, fixed file list; does not touch markdown or packages/
bun run check:plugin     # import-graph guard; CI runs it, `make build` does NOT
```

Rebuild after touching any source, then commit the regenerated output in the same change
(CI rebuilds and runs `git diff --exit-code`):

```bash
bun run build:skill                            # SKILL.md + Claude plugin copy
bun scripts/build-opencode-plugin.mjs          # packages/opencode-ascendant/
bun scripts/build-opencode-plugin.mjs --check  # drift check, builds to a temp dir
```

## Architecture

- `skills/ascendant/tools/*.ts` is the shared engine (Effect + `astro-ascendant`). CLI: `bun skills/ascendant/tools/ascendant.ts <add-person|transit|ruling-planets>`.
- `.opencode/plugins/ascendant/` imports the engine as `../../../skills/ascendant/tools/*.ts`. `build-opencode-plugin.mjs` rewrites that prefix to `../skills` in the package, so keep the repo-relative form when editing plugin sources.
- OpenCode registers the skill, the `/ascendant` command, and both tools programmatically. It reads `skills/ascendant/SKILL.md` at runtime, so there is no OpenCode skill copy to regenerate.
- `skills/ascendant/scripts/ascendant.sh` copies an **explicit allowlist** of tool files into `./.ascendant-agent/` in the user's cwd. Any new file under `tools/` must be added there or the runtime copy will silently miss it.
- Person records are written to `./persons/<name>/` in the user's cwd (gitignored). Never commit them.
- Method preference lives in `./.ascendant/config.txt` in the user's cwd, written by `skills/ascendant/scripts/config.sh` during setup. It holds only `defaultMethod` (`KP`, `Parashari`, `NULL`) and `askMethodEverySession` (`TRUE`, `FALSE`, forced `TRUE` when the method is `NULL`). The directory self-ignores with `*`; never commit it.

## Effect and plugin landmines

- The OpenCode v2 host runs `effect` 4.0.0-beta and only serves public single-level `effect/*` subpaths.
- Never import the `@effect/platform-bun` barrel. Use direct subpaths such as `@effect/platform-bun/BunFileSystem`; `check:plugin` rejects the barrel and deep paths.
- `BunPath` fails the entire plugin load (the host's `effect/Path` has no `make`). Use the local layer in `skills/ascendant/tools/path.ts`; the header explains why.
- `.opencode/package.json` pins exact versions and overrides `effect` to 4.0.5, and `skills/ascendant/scripts/setup.sh` pins the same versions for user installs. Bump them together, then refresh both lockfiles (`bun install` at root and inside `.opencode/`). `packages/ascendant-skills/package.json` pins the same `effect` version and must move with them.

## Release

- Version source of truth is the root `package.json`. `bun run sync-versions` stamps `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, `.opencode/package.json`, then rebuilds everything.
- Flow: add a changeset, `make version`, set the root version, `make build`, commit and push `main`.
- **Ask the user before pushing a release tag.** `git push origin opencode-ascendant-vX.Y.Z` publishes to npm and creates the GitHub Release. The tag must equal the package version; CI enforces it.
- Commit style from history: conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `style:`), scoped where useful.

## Style

- No em dashes or en dashes anywhere in this repo. Use `:`, `;`, `-`, or parentheses.
- Markdown tables use `-` in empty cells.
