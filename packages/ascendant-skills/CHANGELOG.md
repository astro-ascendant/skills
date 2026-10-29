# ascendant-skills

## 2.1.3

### Patch Changes

- `npx ascendant-skills install` now asks which tools to install for with a checkbox list (detected tools pre-checked) instead of a comma-separated text prompt.

## 2.1.2

### Patch Changes

- Fix `npx ascendant-skills install` failing to load on a fresh install (`does not provide an export named 'NodeWS'`). The CLI now pins `@effect/platform-node-shared` to match `effect`.

## 2.1.1

### Patch Changes

- The `npx ascendant-skills install` CLI is now built on `effect/cli`. Flag parsing, validation and help come from the framework; the install behavior is unchanged.
