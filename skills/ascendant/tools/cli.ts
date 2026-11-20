import { encode } from "@toon-format/toon";
import { Console, Effect, FileSystem, Option } from "effect";
import { Command, Flag } from "effect/cli";

import { PlatformLayer } from "./common.ts";
import { failureReport } from "./errors.ts";
import {
  AddPerson,
  CheckTransit,
  Evidence,
  handlers,
  Judge,
  RulingPlanets,
  Verify,
} from "./toolkit.ts";
import {
  ADD_PERSON_HELP,
  decodeInput,
  events,
  EVIDENCE_HELP,
  home,
  JUDGE_HELP,
  RULING_PLANETS_HELP,
  TRANSIT_HELP,
  VERIFY_HELP,
} from "./workflows.ts";
import { VERSION } from "./version.ts";

type Raw = Record<string, unknown>;

/** Keeps only the flags the caller set, unwrapping the optional ones. */
const compact = (fields: Raw): Raw =>
  Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      Option.isOption(value) ? (Option.isSome(value) ? [[key, value.value]] : []) : [[key, value]],
    ),
  );

/** Prints a result as TOON, or a failure as TOON on stdout, then fails with it. */
const emit = <E>(effect: Effect.Effect<Raw, E>) =>
  effect.pipe(
    Effect.tapError((error) => Console.log(encode(failureReport(error)))),
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
      decodeInput(AddPerson.parametersSchema, compact(flags), ADD_PERSON_HELP).pipe(
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
    summary: Flag.Boolean("summary").pipe(
      Flag.withDescription("Leave out the chart attached to each event (default false)"),
      Flag.withDefault(false),
    ),
  },
  (flags) =>
    emit(
      decodeInput(CheckTransit.parametersSchema, compact(flags), TRANSIT_HELP).pipe(
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
        'ascendant transit --name "Ada" --moment "2026-08-27T22:00:00+05:30" --planet Jupiter --summary',
      description: "Same search without the chart attached to each event",
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
      decodeInput(RulingPlanets.parametersSchema, compact(flags), RULING_PLANETS_HELP).pipe(
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

const judge = Command.make(
  "judge",
  {
    name,
    event: Flag.String("event").pipe(
      Flag.withDescription("Event id from the KP house-group table (see `ascendant events`)"),
    ),
    from: Flag.String("from").pipe(
      Flag.withDescription("Offset-aware ISO 8601 start of the timing window"),
    ),
    years: Flag.Finite("years").pipe(
      Flag.withDescription("Length of the timing window in years from 1 to 60 (default 10)"),
      Flag.optional,
    ),
    limit: Flag.Finite("limit").pipe(
      Flag.withDescription("Most timing windows to return from 1 to 50 (default 5)"),
      Flag.optional,
    ),
    rectifyMinutes: Flag.Finite("rectify-minutes").pipe(
      Flag.withDescription(
        "Minutes either side of the birth time to test against past events (default 15, 0 is off)",
      ),
      Flag.optional,
    ),
    ignoreMemory: Flag.Boolean("ignore-memory").pipe(
      Flag.withDescription("Ignore the past events in MEMORY.md (default false)"),
      Flag.withDefault(false),
    ),
    judgmentMoment: Flag.String("judgment-moment").pipe(
      Flag.withDescription(
        "Moment whose ruling planets select significators; leave out to judge without them",
      ),
      Flag.optional,
    ),
  },
  ({ ignoreMemory, ...flags }) =>
    emit(
      decodeInput(
        Judge.parametersSchema,
        { ...compact(flags), useMemory: !ignoreMemory },
        JUDGE_HELP,
      ).pipe(Effect.flatMap(handlers.ascendant_judge)),
    ),
).pipe(
  Command.withDescription("Judge one event by KP rules: promise, significators and timing"),
  Command.withExamples([
    {
      command:
        'ascendant judge --name "Ada" --event marriage --from "2026-01-01T00:00:00+05:30" --years 5',
      description: "Marriage promise and the strongest periods in the next five years",
    },
  ]),
);

const numbersOf = (list: Option.Option<string>): ReadonlyArray<number> | undefined =>
  Option.match(list, {
    onNone: () => undefined,
    onSome: (text) =>
      text
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .map(Number),
  });

const namesOf = (list: Option.Option<string>): ReadonlyArray<string> | undefined =>
  Option.match(list, {
    onNone: () => undefined,
    onSome: (text) =>
      text
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ""),
  });

const evidence = Command.make(
  "evidence",
  {
    name,
    houses: Flag.String("houses").pipe(
      Flag.withDescription("Comma-separated houses the question turns on (default all)"),
      Flag.optional,
    ),
    event: Flag.String("event").pipe(
      Flag.withDescription("Event id from `ascendant events`: adds its house group and KP rule"),
      Flag.optional,
    ),
    vargas: Flag.String("vargas").pipe(
      Flag.withDescription("Comma-separated divisional charts to include (default 9,10)"),
      Flag.optional,
    ),
    from: Flag.String("from").pipe(
      Flag.withDescription("Start of the stretch of life to list periods for"),
      Flag.optional,
    ),
    to: Flag.String("to").pipe(
      Flag.withDescription("End of that stretch; give with --from"),
      Flag.optional,
    ),
    at: Flag.String("at").pipe(
      Flag.withDescription(
        "A moment, usually now: adds the periods and slow transits running then",
      ),
      Flag.optional,
    ),
    compare: Flag.String("compare").pipe(
      Flag.withDescription("Comma-separated period ids to lay side by side as candidates"),
      Flag.optional,
    ),
    depth: Flag.String("depth").pipe(
      Flag.withDescription("dasha, bhukti (default), antara or sookshma"),
      Flag.optional,
    ),
  },
  ({ houses, vargas, compare, ...flags }) =>
    emit(
      decodeInput(
        Evidence.parametersSchema,
        compact({
          ...compact(flags),
          houses: numbersOf(houses),
          vargas: numbersOf(vargas),
          compare: namesOf(compare),
        }),
        EVIDENCE_HELP,
      ).pipe(Effect.flatMap(handlers.ascendant_evidence)),
    ),
).pipe(
  Command.withDescription("List chart facts, periods and slow transits for a question"),
  Command.withExamples([
    {
      command:
        'ascendant evidence --name "Ada" --event service-or-business --from "2020-01-01T00:00:00+05:30" --to "2026-01-01T00:00:00+05:30"',
      description: "Facts and bhukti periods for a first job question",
    },
  ]),
);

const readText = (file: string, what: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(file).pipe(
      Effect.mapError(() => ({
        message: `Unable to read the ${what} file ${file}`,
        code: "VALIDATION_ERROR",
        suggestions: [VERIFY_HELP],
      })),
    );
  });

const parseJson = (text: string, file: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () => ({
      message: `The worksheet file ${file} is not JSON`,
      code: "VALIDATION_ERROR",
      suggestions: [VERIFY_HELP],
    }),
  });

const verify = Command.make(
  "verify",
  {
    name,
    draftFile: Flag.String("draft-file").pipe(
      Flag.withDescription("File holding the draft answer exactly as it would be shown"),
    ),
    worksheetFile: Flag.String("worksheet-file").pipe(
      Flag.withDescription("JSON file holding the reasoning worksheet behind the draft"),
    ),
  },
  ({ draftFile, worksheetFile, ...flags }) =>
    emit(
      Effect.gen(function* () {
        const draft = yield* readText(draftFile, "draft");
        const worksheet = yield* parseJson(
          yield* readText(worksheetFile, "worksheet"),
          worksheetFile,
        );
        const input = yield* decodeInput(
          Verify.parametersSchema,
          { ...compact(flags), draft, worksheet },
          VERIFY_HELP,
        );
        return yield* handlers.ascendant_verify(input);
      }).pipe(Effect.provide(PlatformLayer)),
    ),
).pipe(
  Command.withDescription("Check a draft answer against its reasoning worksheet"),
  Command.withExamples([
    {
      command:
        'ascendant verify --name "Ada" --draft-file ./.ascendant/draft.md --worksheet-file ./.ascendant/worksheet.json',
      description: "Verify a drafted answer",
    },
  ]),
);

const listEvents = Command.make("events", {}, () => emit(events())).pipe(
  Command.withDescription("List the event ids that judge accepts"),
);

const ascendant = Command.make("ascendant", {}, () =>
  emit(home().pipe(Effect.provide(PlatformLayer))),
).pipe(
  Command.withDescription("Calculate saved Vedic astrology records and search transits"),
  Command.withSubcommands([addPerson, transit, rulingPlanets, judge, evidence, verify, listEvents]),
);

/** The `ascendant` command line. Provide platform services and run it. */
export const cli = ascendant.pipe(Command.run({ version: VERSION }));
