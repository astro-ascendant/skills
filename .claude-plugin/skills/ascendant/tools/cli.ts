import { encode } from "@toon-format/toon";
import { Console, Effect, Option, Schema } from "effect";
import { Command, Flag } from "effect/cli";

import { CommandError } from "./errors.ts";
import { PlatformLayer } from "./common.ts";
import { AddPerson, CheckTransit, handlers, RulingPlanets } from "./toolkit.ts";
import { ADD_PERSON_HELP, home, RULING_PLANETS_HELP, TRANSIT_HELP } from "./workflows.ts";
import { VERSION } from "./version.ts";

type Raw = Record<string, unknown>;

/** Keeps only the flags the caller set, unwrapping the optional ones. */
const compact = (fields: Raw): Raw =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      Option.isOption(value) ? (Option.isSome(value) ? [[key, value.value]] : []) : [[key, value]],
    ),
  );

/** Decodes flags with the same schema the plugin uses for the tool. */
const decode = <A, I>(schema: Schema.Codec<A, I>, raw: Raw, help: string) =>
  Schema.decodeUnknownEffect(schema)(raw).pipe(
    Effect.mapError(
      (error) =>
        new CommandError({ message: error.message, code: "VALIDATION_ERROR", suggestions: [help] }),
    ),
  );

/** Prints a result as TOON, or a failure as TOON on stdout, then fails with it. */
const emit = <E>(effect: Effect.Effect<Raw, E>) =>
  effect.pipe(
    Effect.tapError((error) =>
      Console.log(
        encode(
          error instanceof CommandError
            ? { error: error.message, code: error.code, help: error.suggestions }
            : { error: String(error), code: "UNKNOWN", help: [] },
        ),
      ),
    ),
    Effect.flatMap((output) => Console.log(encode(output))),
  );

const name = Flag.String("name").pipe(Flag.withDescription("Saved person name"));
const moment = (description: string) =>
  Flag.String("moment").pipe(Flag.withDescription(description));
const latitude = Flag.Finite("latitude").pipe(Flag.withDescription("Latitude from -90 to 90"));
const longitude = Flag.Finite("longitude").pipe(Flag.withDescription("Longitude from -180 to 180"));

const addPerson = Command.make(
  "add-person",
  {
    name,
    moment: moment("Offset-aware ISO 8601 birth moment"),
    latitude,
    longitude,
    sex: Flag.Literals("sex", ["Male", "Female"]).pipe(
      Flag.withDescription("Birth sex"),
      Flag.optional,
    ),
  },
  (flags) =>
    emit(
      decode(AddPerson.parametersSchema, compact(flags), ADD_PERSON_HELP).pipe(
        Effect.flatMap(handlers.ascendant_add_person),
      ),
    ),
).pipe(
  Command.withDescription("Create or refresh Vedic charts plus a separate KP D1"),
  Command.withExamples([
    {
      command:
        'ascendant add-person --name "Ada" --moment "1990-01-01T12:00:00+05:30" --latitude 12.9716 --longitude 77.5946',
      description: "Save a person from birth data",
    },
  ]),
);

const transit = Command.make(
  "transit",
  {
    name,
    moment: moment("Offset-aware ISO 8601 start moment"),
    planet: Flag.String("planet").pipe(
      Flag.withDescription(
        "Graha: Sun, Moon, Mars, Mercury, Venus, Jupiter, Saturn, Rahu, or Ketu",
      ),
    ),
    school: Flag.Literals("school", ["kp", "parashari"]).pipe(
      Flag.withDescription(
        "parashari (default, Lahiri/WholeSign) or kp (KrishnamurtiVP291/Placidus)",
      ),
      Flag.optional,
    ),
    direction: Flag.String("direction").pipe(
      Flag.withDescription("forward (default) or backward"),
      Flag.optional,
    ),
    kinds: Flag.String("kinds").pipe(
      Flag.withDescription(
        "Comma-separated kinds (default sign-ingress): sign-ingress, cusp-crossing, longitude-hit, station",
      ),
      Flag.map((value) => value.split(",").map((kind) => kind.trim())),
      Flag.optional,
    ),
    count: Flag.Finite("count").pipe(
      Flag.withDescription("Number of events from 1 to 100 (default 5)"),
      Flag.optional,
    ),
    targetLongitude: Flag.Finite("target-longitude").pipe(
      Flag.withDescription("Required for longitude-hit: sidereal longitude from 0 to 360"),
      Flag.optional,
    ),
    house: Flag.Finite("house").pipe(
      Flag.withDescription("Required for cusp-crossing: natal house from 1 to 12"),
      Flag.optional,
    ),
    maxYears: Flag.Finite("max-years").pipe(
      Flag.withDescription("Search window in years (default 30)"),
      Flag.optional,
    ),
    precisionMinutes: Flag.Finite("precision-minutes").pipe(
      Flag.withDescription("Refinement precision in minutes (default 1)"),
      Flag.optional,
    ),
  },
  (flags) =>
    emit(
      decode(CheckTransit.parametersSchema, compact(flags), TRANSIT_HELP).pipe(
        Effect.flatMap(handlers.ascendant_check_transit),
      ),
    ),
).pipe(
  Command.withDescription("Search transit events from a saved person's location"),
  Command.withExamples([
    {
      command:
        'ascendant transit --name "Ada" --moment "2026-08-27T22:00:00+05:30" --planet Jupiter',
      description: "Next Jupiter sign ingress",
    },
    {
      command:
        'ascendant transit --name "Ada" --moment "2026-08-27T22:00:00+05:30" --planet Saturn --kinds sign-ingress,station --count 3',
      description: "Next three Saturn ingresses and stations",
    },
  ]),
);

const rulingPlanets = Command.make(
  "ruling-planets",
  {
    moment: moment("Offset-aware ISO 8601 judgment moment"),
    name: name.pipe(
      Flag.withDescription("Saved person; uses their birthplace without --latitude/--longitude"),
      Flag.optional,
    ),
    latitude: latitude.pipe(Flag.optional),
    longitude: longitude.pipe(Flag.optional),
  },
  (flags) =>
    emit(
      decode(RulingPlanets.parametersSchema, compact(flags), RULING_PLANETS_HELP).pipe(
        Effect.flatMap(handlers.ascendant_ruling_planets),
      ),
    ),
).pipe(
  Command.withDescription("Read KP ruling planets for a judgment moment and place"),
  Command.withExamples([
    {
      command:
        'ascendant ruling-planets --moment "2026-09-23T10:00:00+05:30" --latitude 12.9716 --longitude 77.5946',
      description: "Ruling planets for a place",
    },
  ]),
);

const ascendant = Command.make("ascendant", {}, () =>
  emit(home().pipe(Effect.provide(PlatformLayer))),
).pipe(
  Command.withDescription("Calculate saved Vedic astrology records and search transits"),
  Command.withSubcommands([addPerson, transit, rulingPlanets]),
);

/** The `ascendant` command line. Provide platform services and run it. */
export const cli = ascendant.pipe(Command.run({ version: VERSION }));
