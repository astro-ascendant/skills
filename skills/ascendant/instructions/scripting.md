# Scripting

Reach this file when one step needs three or more tool calls, or a loop or filter over their results (for example a transit check for each dasha lord). Otherwise call the shell scripts one by one. Scripting needs the same host as `add`: it can write the working directory and run skill scripts, with packages installed by `instructions/setup.md`.

A script is a short Effect program. It calls the Ascendant API, which runs the same verified calculations as the shell scripts, and prints the result. Never compute astrology in the script yourself: take every placement, lord, and date from the API.

## Run

Write the script to `./.ascendant/scripts/<task>.ts`, then run it from the working directory:

```bash
bash "<skill-dir>/scripts/run-script.sh" ./.ascendant/scripts/<task>.ts
```

Done when stdout shows the script's result as TOON. A failure prints `error`, `code`, and `help`, and exits non-zero; fix the input it names and rerun.

## API

Import from `../../.ascendant-agent/tools/api.ts`. Every function takes the same plain input as the matching shell script and returns an `Effect` that fails with `CommandError`.

| Function | Input fields | Result |
|---|---|---|
| `addPerson` | `name`, `moment`, `latitude`, `longitude`, `sex?` | Same as `add-person.sh` |
| `checkTransit` | `name`, `moment`, `planet`, `school?`, `direction?`, `kinds?` (array), `count?`, `targetLongitude?`, `house?`, `maxYears?`, `precisionMinutes?` | Same as `check-transit.sh` |
| `rulingPlanets` | `moment`, `name?`, `latitude?`, `longitude?` | Same as `ruling-planets.sh` |
| `home` | none | Saved people |
| `main(program)` | an `Effect` | Prints its result and exits with its failure code |

Field meanings and limits match the shell flags: `moment` is ISO 8601 with `Z` or an offset, `school` is `kp` or `parashari`, `planet` is a graha name.

## Example

Next sign ingress for each planet in the Step 5 shortlist, read in one run:

```ts
import { Effect } from "effect";
import { checkTransit, main } from "../../.ascendant-agent/tools/api.ts";

const lords = ["Jupiter", "Saturn", "Venus"] as const;

main(
  Effect.forEach(
    lords,
    (planet) =>
      checkTransit({
        name: "Ada",
        moment: "2026-08-27T22:00:00+05:30",
        planet,
        school: "kp",
        count: 1,
      }),
    { concurrency: 3 },
  ),
);
```

## Rules

- Use only the API above, `effect`, and the standard `Effect` helpers (`forEach`, `all`, `gen`, `map`, `filter`).
- Write only under `persons/` through `addPerson`, and under `./.ascendant/scripts/`. Trial moments go to a `<name> rectification` record, as in the school file.
- Make no network calls and read no files outside `persons/` and `references/`.
- Cite the printed output exactly as for the shell scripts.
