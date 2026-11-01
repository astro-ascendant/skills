# ascendant-skills

## 2.1.4

### Patch Changes

- Fix two install failures: `opencode plugin add` no longer gets the unsupported `-g` flag (that command always writes the global config), and a Codex marketplace that is already registered from a different source is dropped and re-added instead of aborting the run with a stale plugin.

## 2.1.3

### Patch Changes

- `npx ascendant-skills install` now asks which tools to install for with a checkbox list (detected tools pre-checked) instead of a comma-separated text prompt.

## 2.1.2

### Patch Changes

- Fix `npx ascendant-skills install` failing to load on a fresh install (`does not provide an export named 'NodeWS'`). The CLI now pins `@effect/platform-node-shared` to match `effect`.

## 2.1.1

### Patch Changes

- The `npx ascendant-skills install` CLI is now built on `effect/cli`. Flag parsing, validation and help come from the framework; the install behavior is unchanged.
