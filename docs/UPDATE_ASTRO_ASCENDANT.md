# Update astro-ascendant

Roll the `astro-ascendant` dependency forward and bring the pinned installers plus the Claude plugin copy along with it.

## Steps

1. **Pin the target version.** Ask the user which version to move to when the message names none. Done when a single target version is named.
2. **Update the package.** Bump `astro-ascendant` to the target version in `package.json` and in `.opencode/package.json` (the OpenCode plugin calls it in-process), and install with the repo's installer (`bun install`, plus `bun install` inside `.opencode/`). Done when `package.json` plus `bun.lock` and `.opencode/package.json` plus `.opencode/bun.lock` record the target version and the installs finish clean.
3. **Sync pinned installer and rebuild the plugin copy.** Update the `astro-ascendant@<version>` pin in `skills/ascendant/scripts/setup.sh` (`package_specs`), then run `make build` to match every manifest version and regenerate everything (the canonical `SKILL.md` plus the Claude plugin copy via `scripts/build-skill.mjs`, and `packages/opencode-ascendant/` re-stamped via `scripts/build-opencode-plugin.mjs`). OpenCode needs no other rebuild: its skill, command, and tools are registered programmatically by `.opencode/plugins/ascendant/`. Hand-edits inside `.claude-plugin/skills/` get overwritten on the next run, so route every fix through `skills/ascendant/` plus a rebuild. Done when no stale version pin remains and the rebuilt copies are in sync.
4. **Verify.** Covered by `make build` (typecheck, tests, lint, and format-check run at the end). Done when every suite is green.
5. **Commit gate.** Show the diff stat with the rebuilt-copy summary and ask the user for commit approval, proposing a message naming the version. Commit only on an explicit yes. Done when the change is committed after a yes, or left uncommitted after any other answer.
