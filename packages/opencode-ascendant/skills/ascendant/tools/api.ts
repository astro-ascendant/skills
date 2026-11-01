import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import { encode } from "@toon-format/toon";
import { Console, Effect } from "effect";

import { AppLayer, KpAstroParamsLayer, PlatformLayer } from "./common.ts";
import { failureReport } from "./errors.ts";
import { AddPersonInput, CheckTransitInput, RulingPlanetsInput } from "./tool-specs.ts";
import {
  ADD_PERSON_HELP,
  addPerson as addPersonWorkflow,
  checkTransit as checkTransitWorkflow,
  decodeInput,
  home as homeWorkflow,
  RULING_PLANETS_HELP,
  rulingPlanets as rulingPlanetsWorkflow,
  TRANSIT_HELP,
} from "./workflows.ts";

/**
 * The API for agent scripts (Code Mode). Each function takes the same plain
 * input as the matching CLI command and returns an `Effect` that fails with
 * `CommandError`, so a script can compose, loop and filter them with
 * `Effect.all`, `Effect.forEach` and `Effect.gen`. Run a script with
 * `scripts/run-script.sh`; end it with `main(program)`.
 */

export const addPerson = (input: typeof AddPersonInput.Encoded) =>
  decodeInput(AddPersonInput, input, ADD_PERSON_HELP).pipe(Effect.flatMap(addPersonWorkflow));

export const checkTransit = (input: typeof CheckTransitInput.Encoded) =>
  decodeInput(CheckTransitInput, input, TRANSIT_HELP).pipe(Effect.flatMap(checkTransitWorkflow));

export const rulingPlanets = (input: typeof RulingPlanetsInput.Encoded) =>
  decodeInput(RulingPlanetsInput, input, RULING_PLANETS_HELP).pipe(
    Effect.flatMap(rulingPlanetsWorkflow),
  );

/** Saved people in `./persons`. */
export const home = () => homeWorkflow().pipe(Effect.provide(PlatformLayer));

/** Layers for scripts that call `astro-ascendant` directly: Parashari and KP. */
export const layers = { parashari: AppLayer, kp: KpAstroParamsLayer } as const;

/**
 * Run a script's program: print its result as TOON, or its failure as a TOON
 * report, and exit with the failure's code.
 */
export const main = <A, E>(program: Effect.Effect<A, E>): void =>
  program.pipe(
    Effect.tap((output) => Console.log(encode(output))),
    Effect.tapError((error) => Console.log(encode(failureReport(error)))),
    BunRuntime.runMain({ disableErrorReporting: true }),
  );
