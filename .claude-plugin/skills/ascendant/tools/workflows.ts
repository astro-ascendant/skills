import { Swisseph, Transit } from "astro-ascendant";
import { Effect, FileSystem, Layer, Match, Path, Schema } from "effect";

import { addPersonFromInput } from "./add-person.ts";
import { searchTransits } from "./check-transit.ts";
import {
  AppLayer,
  KpAstroParamsLayer,
  PersonRecordConflict,
  PersonRecordNotFound,
  PlatformLayer,
  readStoredPerson,
} from "./common.ts";
import { CommandError } from "./errors.ts";
import { rulingPlanetsWorkflow } from "./ruling-planets.ts";
import type { AddPersonInput, CheckTransitInput, RulingPlanetsInput } from "./tool-specs.ts";

export const ADD_PERSON_HELP =
  'Run `ascendant add-person --name "<name>" --moment "<ISO-8601>" --latitude <latitude> --longitude <longitude> [--sex Male|Female]`';
export const TRANSIT_HELP =
  'Run `ascendant transit --name "<name>" --moment "<ISO-8601>" --planet <graha> [--school kp|parashari] [--direction forward|backward] [--kinds sign-ingress,...] [--count <1-100>] [--target-longitude <0-360>] [--house <1-12>] [--max-years <years>] [--precision-minutes <minutes>]`';
export const RULING_PLANETS_HELP =
  'Run `ascendant ruling-planets --moment "<ISO-8601>" (--name "<name>" | --latitude <latitude> --longitude <longitude>)`';

const KpLayer = Layer.mergeAll(PlatformLayer, KpAstroParamsLayer, Swisseph.SwissephLayer);

interface Fallback {
  readonly code: string;
  readonly message: string;
  readonly help: string;
}

const domainError = (error: unknown, name: string, fallback: Fallback): CommandError =>
  Match.value(error).pipe(
    Match.when(
      Match.instanceOf(PersonRecordNotFound),
      (notFound) =>
        new CommandError({
          message: notFound.message,
          code: "PERSON_NOT_FOUND",
          suggestions: [
            `Run \`ascendant add-person --name "${name}" --moment "<ISO-8601>" --latitude <latitude> --longitude <longitude>\``,
          ],
        }),
    ),
    Match.when(
      Match.instanceOf(PersonRecordConflict),
      (conflict) =>
        new CommandError({
          message: conflict.message,
          code: "PERSON_RECORD_CONFLICT",
          suggestions: [],
        }),
    ),
    Match.when(
      Match.instanceOf(Transit.TransitValidationError),
      (invalid) =>
        new CommandError({
          message: invalid.message,
          code: "VALIDATION_ERROR",
          suggestions: [TRANSIT_HELP],
        }),
    ),
    Match.when(
      Match.instanceOf(Transit.TransitSearchExhausted),
      (exhausted) =>
        new CommandError({
          message: exhausted.message,
          code: "TRANSIT_SEARCH_EXHAUSTED",
          suggestions: [
            `Found ${exhausted.found.length} events before the search window ran out; retry with a larger --max-years`,
          ],
        }),
    ),
    Match.orElse(
      () =>
        new CommandError({
          message: fallback.message,
          code: fallback.code,
          suggestions: [fallback.help],
        }),
    ),
  );

/** Decodes plain input with a tool's schema; failures are validation errors. */
export const decodeInput = <A, I>(schema: Schema.Codec<A, I>, raw: unknown, help: string) =>
  Schema.decodeUnknownEffect(schema)(raw).pipe(
    Effect.mapError(
      (error) =>
        new CommandError({ message: error.message, code: "VALIDATION_ERROR", suggestions: [help] }),
    ),
  );

const validation = (message: string, help: string) =>
  new CommandError({ message, code: "VALIDATION_ERROR", suggestions: [help] });

export const addPerson = Effect.fn("Ascendant.addPersonTool")(function* (input: AddPersonInput) {
  return yield* addPersonFromInput(
    input.name,
    input.moment,
    input.latitude,
    input.longitude,
    input.sex,
  ).pipe(
    Effect.mapError((error) =>
      domainError(error, input.name, {
        code: "ADD_PERSON_FAILED",
        message: "Unable to add the person record",
        help: "Verify the birth data and current working directory, then retry",
      }),
    ),
    Effect.provide(AppLayer),
  );
});

export const checkTransit = Effect.fn("Ascendant.checkTransitTool")(function* (
  input: CheckTransitInput,
) {
  const [firstKind, ...restKinds] = input.kinds ?? (["sign-ingress"] as const);
  if (firstKind === undefined) {
    return yield* validation("At least one transit kind is required", TRANSIT_HELP);
  }
  const layer = input.school === "kp" ? KpLayer : AppLayer;
  return yield* searchTransits(input.name, input.moment, {
    planet: input.planet,
    school: input.school === "kp" ? "KP" : "Parashari",
    direction: input.direction ?? "forward",
    kinds: [firstKind, ...restKinds],
    count: input.count ?? 5,
    ...(input.targetLongitude !== undefined ? { targetLongitude: input.targetLongitude } : {}),
    ...(input.house !== undefined ? { house: input.house } : {}),
    ...(input.maxYears !== undefined ? { maxYears: input.maxYears } : {}),
    ...(input.precisionMinutes !== undefined ? { precisionMinutes: input.precisionMinutes } : {}),
  }).pipe(
    Effect.mapError((error) =>
      domainError(error, input.name, {
        code: "TRANSIT_FAILED",
        message: "Unable to search transits",
        help: "Verify the saved person record and search flags, then retry",
      }),
    ),
    Effect.provide(layer),
  );
});

export const rulingPlanets = Effect.fn("Ascendant.rulingPlanetsTool")(function* (
  input: RulingPlanetsInput,
) {
  const name = input.name ?? "";
  const fallback = (message: string, help: string): Fallback => ({
    code: "RULING_PLANETS_FAILED",
    message,
    help,
  });

  const place =
    input.latitude !== undefined && input.longitude !== undefined
      ? { latitude: input.latitude, longitude: input.longitude }
      : input.name === undefined
        ? yield* validation(
            "Provide --latitude and --longitude, or --name of a saved person",
            RULING_PLANETS_HELP,
          )
        : yield* readStoredPerson(input.name).pipe(
            Effect.mapError((error) =>
              domainError(
                error,
                name,
                fallback(
                  "Unable to read the saved person record",
                  "Verify the person name and current working directory, then retry",
                ),
              ),
            ),
            Effect.provide(PlatformLayer),
            Effect.map((person) => ({
              latitude: input.latitude ?? person.latitude,
              longitude: input.longitude ?? person.longitude,
            })),
          );

  return yield* rulingPlanetsWorkflow(input.moment, place.latitude, place.longitude).pipe(
    Effect.mapError((error) =>
      domainError(
        error,
        name,
        fallback(
          "Unable to read ruling planets",
          "Verify the judgment moment and place, then retry",
        ),
      ),
    ),
    Effect.provide(KpLayer),
  );
});

/** Saved people in `./persons`, with the next commands to try. */
export const home = Effect.fn("Ascendant.home")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const personsDirectory = "persons";

  if (!(yield* fs.exists(personsDirectory))) {
    return {
      persons: { count: 0, records: [] },
      help: [ADD_PERSON_HELP],
    };
  }

  const entries = yield* fs.readDirectory(personsDirectory);
  const records = yield* Effect.filter(entries, (entry) =>
    fs.exists(path.join(personsDirectory, entry, "input.md")),
  );

  return {
    persons: {
      count: records.length,
      records: [...records].sort().map((name: string) => ({ name, status: "ready" })),
    },
    help: [
      'Run `ascendant transit --name "<name>" --moment "<ISO-8601>" --planet <graha>`',
      ADD_PERSON_HELP,
    ],
  };
});
