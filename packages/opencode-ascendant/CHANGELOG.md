# opencode-ascendant

## 2.1.3

### Patch Changes

- `npx ascendant-skills install` now asks which tools to install for with a checkbox list (detected tools pre-checked) instead of a comma-separated text prompt.

## 2.1.2

### Patch Changes

- Fix `npx ascendant-skills install` failing to load on a fresh install (`does not provide an export named 'NodeWS'`). The CLI now pins `@effect/platform-node-shared` to match `effect`.

## 2.1.1

### Patch Changes

- The `npx ascendant-skills install` CLI is now built on `effect/cli`. Flag parsing, validation and help come from the framework; the install behavior is unchanged.

## 2.1.0

### Minor Changes

- Add `npx ascendant-skills install`, a one-command setup CLI for Claude Code, Codex, OpenCode, Cursor and Gemini CLI, published as the new `ascendant-skills` package alongside this one.

## 2.0.1

### Patch Changes

- Improve the skill workflow and clarify KP and Parashari analysis guidance.

## 2.0.0

### Major Changes

- d677629: Stop reading person records written by retired artifact formats.

  Records were saved as `input.txt`, then `input.toon`, then `input.json` before the
  Markdown format landed. The engine carried a fallback reader for all three plus a
  cleanup list that deleted the old `charts/*.txt|toon|json`, `dasha.txt`, `sav.txt`,
  `kp/D1.txt`, and `jaimini/*` files on refresh. That list had already drifted (it
  covered three extensions for charts and jaimini but only `.txt` for the KP artifacts)
  and two of its helpers, `readLegacyToonStoredPerson` and `readLegacyStoredPerson`,
  had no callers at all.

  `input.md` is now the only accepted record format. A directory without it returns
  `PersonRecordConflict` naming the directory and the retired filename, so the fix is
  to move or delete `persons/<name>/` and run `add` again. `person latest` counts only
  Markdown records. The dead helpers, the dead `ToonEncodingError`, and the cleanup
  list are gone; `ToonDecodingError` is now `RecordDecodingError` because it only
  reports frontmatter and schema problems. `@toon-format/toon` stays a dependency:
  CLI and plugin output are still TOON-encoded.

  BREAKING CHANGE: records created by an older version are no longer readable. Move or
  delete `persons/<name>/`, then run `add` with the same birth data to regenerate it.

- ec6f0c8: Keep KP-only data out of the Parashari chart files.

  `charts/D1.md` through `charts/D60.md` were emitted by a school-blind formatter: every
  varga carried KP's `Star Lord` / `Sub Lord` / `Sub-Sub Lord` cuspal chain, and
  `charts/D1.md` additionally carried `House Significations`, `Planet Significations`,
  `House Significators`, and `Ruling Planets`. Those quantities belong to KP alone, and
  in `charts/` they were computed from Lahiri whole-sign cusps rather than
  Krishnamurti / Placidus ones, so they were invalid for both schools.

  Parashari charts now print `House | Cusp | Point | Sign Lord | Longitude | Degree |
  Sign | Dignity | Retrograde`, with empty houses keeping their cusp, sign, and rashi
  lord. KP keeps the full four-lord chain, significations, significators, and ruling
  planets in `kp/D1.md` as before. Chart titles drop the duplicated division suffix
  (`# Vedic Chart D1`, `# KP Chart D1`) and provenance is stated once in the calculation
  table.

  BREAKING CHANGE: existing `persons/<name>/charts/` files keep the old hybrid format
  until the record is regenerated. Re-run `add` to rewrite them; no other file changes
  meaning.

- 6799dc3: Ship one skill copy instead of eight.

  The repo committed a generated `skills/ascendant/` tree under `.claude/`, `.cursor/`,
  `.gemini/`, `.kiro/`, `.pi/`, `.grok/`, and `.agent/`. None of them had an install path:
  `npx skills add astro-ascendant/skills` reads the canonical `skills/ascendant/`, the
  Claude plugin ships `.claude-plugin/skills/ascendant/`, Codex reads `skills/` through
  `.codex-plugin/plugin.json`, and OpenCode registers everything from
  `.opencode/plugins/ascendant/`. The seven trees were pure duplication (about 2.1k lines
  each), so any skill edit landed nine times in review and CI drift checks.

  `bun run build:skill` now writes only the canonical `SKILL.md` and the Claude plugin
  copy. Harnesses without a plugin shim install the canonical skill globally with
  `npx skills`, which was already the documented path. Cursor, Gemini, Kiro, Pi, Grok,
  and Antigravity lose their committed repo-local copy and nothing else.

  BREAKING CHANGE: cloning the repo no longer provides `<harness>/skills/ascendant/`
  for those six harnesses. Install the plugin (Claude, Codex, OpenCode) or add the
  canonical skill globally.

### Minor Changes

- 5fcde26: Ask for the reading method instead of assuming KP.

  The skill treated KP as the default track whenever the user did not name a
  school. Setup now records the preference in `<cwd>/.ascendant/config.txt`:

  ```text
  defaultMethod: KP | Parashari | NULL
  askMethodEverySession: TRUE | FALSE
  ```

  Both keys are asked during `setup`. `NULL` means ask every time and forces
  `askMethodEverySession: TRUE`. Analysis resolves the school in order: a school
  named in the request, then `askMethodEverySession`, then `defaultMethod`, and
  finally a one-line question. A missing file reads as `NULL` and `TRUE`, so the
  skill asks rather than guessing.

  `scripts/config.sh show|set` reads and writes the file, and the directory
  self-ignores with `*`. Tests pin canonical values, the `NULL` coercion, the
  missing-file default, and rejection of an unknown method.

### Patch Changes

- ab6bda0: Point repository metadata at the renamed `astro-ascendant/skills` repository.
- 2b473d2: Publish the author and license in the skill frontmatter.

  `SKILL.src.md` now declares `license: AGPL-3.0-or-later` and
  `metadata.author: Laxman K R`, matching `plugin.json` and the repository
  license. The builder previously emitted only a fixed key set, so it now
  carries `license` and `metadata` through to the canonical `SKILL.md` and the
  Claude plugin copy; a missing field would have been dropped silently.

  The test reads all three files and fails if any copy loses either field.

## 1.1.1

### Patch Changes

- Point the npm package homepage at the live site instead of the retired alias.

  - `packages/opencode-ascendant/package.json` now sets `homepage` to `https://astro-ascendant.vercel.app` (was `https://ascendant-docs.vercel.app`, a 301 to the live site).
  - The package README links the docs at `https://astro-ascendant.vercel.app/docs/skills`.
  - The portable, Claude, and Codex plugin manifests carry the same homepage.

## 1.1.0

### Minor Changes

- 686f44a: Rename the `init` mode to `add` across the skill, CLI, and tools.

  - Skill argument is now `add` (`/ascendant add`), with routing, dispatch, setup, and README docs updated.
  - CLI command is `add-person` (was `init-person`); the root `add-person` script follows it.
  - OpenCode tool is `ascendant_add_person` (was `ascendant_init_person`); the shell script is `scripts/add-person.sh`.
  - Exported helpers are `addPerson` and `addPersonFromInput`.

### Patch Changes

- 241b3a2: Point repository metadata at the astro-ascendant org and add issue intake.

  - Set the git origin to `https://github.com/astro-ascendant/ascendant-agents.git`.
  - Add `homepage` (`https://astro-ascendant.vercel.app`) and `repository` to the root `package.json`.
  - Add GitHub issue templates for astrology miscalculation reports and feature requests.

## 1.0.3

### Patch Changes

- Fix OpenCode plugin load failure on hosts running effect 4.0.0-beta.x: replace `@effect/platform-node-shared` with `@effect/platform-bun` direct subpaths and a host-compatible `Path` layer, and go bun-only at runtime.

## 1.0.2

### Patch Changes

- Remove em dashes from the skill instructions and package docs, and add RELEASE.md with a `version` make target plus an npm upgrade in the release workflow for OIDC trusted publishing.

## 1.0.1

### Patch Changes

- Fix plugin load failure under OpenCode: keep `effect` and `@opencode/*` peer-only and import `@effect/platform-node-shared` Node layers via direct subpaths, so no private `effect/dist/*` module enters the plugin graph.

## 1.0.0

### Minor Changes

- Initial public release: OpenCode skill, `/ascendant` slash command, and in-process `ascendant_init_person` / `ascendant_check_transit` calculation tools.
