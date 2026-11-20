import { Chart, Dasha, Ephemeris } from "astro-ascendant";
import {
  Array as Arr,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  pipe,
  Schema,
} from "effect";

import {
  calculationContext,
  ChartIncomplete,
  decodeMoment,
  KpAstroParams,
  PersonName,
  personsDirectory,
  readStoredPerson,
  type StoredPerson,
} from "./common.ts";
import { EXCLUDED_KP_EVENTS, findKpEvent, KP_EVENTS } from "./events.ts";
import {
  BirthTime,
  checkBirthTime,
  confidenceWithMemory,
  Fit,
  fitPastEvent,
  MIN_PAST_EVENTS,
  scoreFit,
} from "./kp-hindcast.ts";
import {
  ENGINE_CHOICES,
  judgeKp,
  Judgment,
  KpFacts,
  Planet,
  type KpPeriod,
  type Sky,
} from "./kp-judge.ts";
import { kpCuspAndPlanetLords, starLordOf } from "./kp-lords.ts";
import { emptyMemory, IgnoredLine, parseMemory } from "./memory.ts";
import { rulingPlanetsWorkflow } from "./ruling-planets.ts";
import type { JudgeInput } from "./tool-specs.ts";

const DEFAULT_YEARS = 10;
const DEFAULT_LIMIT = 5;
const DEFAULT_RECTIFY_MINUTES = 15;
const DAYS_PER_YEAR = 365.25;

export class UnknownEvent extends Schema.TaggedError<UnknownEvent>()("UnknownEvent", {
  event: Schema.String,
  message: Schema.String,
}) {}

export const kpFactsOf = Effect.fn("Ascendant.kpFactsOf")(function* (chart: Chart.D1Chart) {
  const lords = kpCuspAndPlanetLords(chart);
  const planets = Arr.filter(lords.planetLords, (planet) => planet.name !== "Lagna");
  return yield* Schema.decodeUnknownEffect(KpFacts)({
    cuspSubLords: Object.fromEntries(
      Arr.map(lords.cuspLords, (cusp) => [cusp.house, cusp.subLord]),
    ),
    planetStarLords: Object.fromEntries(
      Arr.map(planets, (planet) => [planet.name, planet.starLord]),
    ),
    planetSubLords: Object.fromEntries(Arr.map(planets, (planet) => [planet.name, planet.subLord])),
    planetSignifications: chart.planetSignifications,
    houseSignificators: chart.houseSignificators,
  }).pipe(
    Effect.mapError(
      () => new ChartIncomplete({ message: "KP chart is missing cusps, planets or significators" }),
    ),
  );
});

export type BirthPlace = Pick<StoredPerson, "latitude" | "longitude" | "sex">;

export const kpChartAt = Effect.fn("Ascendant.kpChartAt")(function* (
  person: BirthPlace,
  birth: DateTime.Utc,
) {
  const moment = Chart.Moment.make({ date: birth });
  const calculation = yield* Chart.generate(
    {
      moment,
      latitude: person.latitude,
      longitude: person.longitude,
      ...(person.sex !== undefined ? { sex: person.sex } : {}),
    },
    [],
  );
  const d1 = yield* pipe(
    Option.fromUndefinedOr(calculation.charts[0]),
    Option.match({
      onNone: () =>
        Effect.fail(new ChartIncomplete({ message: "KP chart generation returned no D1" })),
      onSome: Effect.succeed,
    }),
  );
  const facts = yield* kpFactsOf(d1);
  const timeline = yield* Dasha.calculate(moment, calculation.placements);
  const periods = pipe(
    timeline,
    Arr.flatMap((mahadasha) => mahadasha.antardashas),
    Arr.flatMap((antardasha) => Dasha.pratyantardashas(antardasha)),
    Arr.map((antara): KpPeriod => ({
      dasha: antara.mahadasha,
      bhukti: antara.antardasha,
      antara: antara.pratyantardasha,
      start: antara.start,
      end: antara.end,
    })),
  );
  return { facts, periods };
});

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
export const TRANSIT_STEP_DAYS = 1;

export const skyBetween = Effect.fn("Ascendant.skyBetween")(function* (
  from: DateTime.Utc,
  to: DateTime.Utc,
  stepDays: number,
) {
  const ephemeris = yield* Ephemeris.Ephemeris;
  const sampleCount = Math.max(
    0,
    Math.ceil(
      (DateTime.toEpochMillis(to) - DateTime.toEpochMillis(from)) / (stepDays * MILLIS_PER_DAY),
    ),
  );
  const samples = yield* Effect.forEach(
    Arr.makeBy(sampleCount, (index) => DateTime.add(from, { days: index * stepDays })),
    (at) =>
      Effect.gen(function* () {
        const julianDay = yield* ephemeris.dateToJulianDay(at);
        const starLordOfTransiting = (planet: Planet) =>
          Effect.map(
            ephemeris.calculatePosition(julianDay, planet, KpAstroParams.ayanamsa),
            (position): Planet => starLordOf(position.longitude),
          );
        const starLords = yield* Effect.all({
          Sun: starLordOfTransiting("Sun"),
          Moon: starLordOfTransiting("Moon"),
          Mars: starLordOfTransiting("Mars"),
          Mercury: starLordOfTransiting("Mercury"),
          Jupiter: starLordOfTransiting("Jupiter"),
          Venus: starLordOfTransiting("Venus"),
          Saturn: starLordOfTransiting("Saturn"),
          Rahu: starLordOfTransiting("Rahu"),
          Ketu: starLordOfTransiting("Ketu"),
        });
        return { at, starLords };
      }),
  );
  return { stepDays, samples } satisfies Sky;
});

export const readMemoryOrEmpty = Effect.fn("Ascendant.readMemoryOrEmpty")(function* (name: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(yield* personsDirectory, name, "MEMORY.md");
  const found = yield* fs.exists(file);
  return {
    file: `persons/${name}/MEMORY.md`,
    found,
    memory: found ? parseMemory(yield* fs.readFileString(file)) : emptyMemory,
  };
});

const Ruling = Schema.Struct({ moment: Schema.String, planets: Schema.Array(Planet) });
interface Ruling extends Schema.Schema.Type<typeof Ruling> {}

const MemoryReport = Schema.Union([
  Schema.Struct({ status: Schema.Literal("not-used") }),
  Schema.Struct({
    file: Schema.String,
    status: Schema.Literals(["missing", "empty", "used"]),
    used: Schema.Array(
      Schema.Struct({
        line: Schema.Int,
        date: Schema.String,
        event: Schema.String,
        message: Schema.String,
      }),
    ),
    ignored: Schema.Array(IgnoredLine),
    hindcast: Schema.Array(Fit),
    birthTime: BirthTime,
  }),
]);

export const JudgeResult = Schema.Struct({
  person: Schema.Struct({ name: PersonName }),
  calculation: Schema.Struct({
    school: Schema.String,
    ayanamsa: Schema.String,
    houseSystem: Schema.String,
    dashaSystem: Schema.String,
  }),
  window: Schema.Struct({
    from: Schema.DateTimeUtcFromString,
    to: Schema.DateTimeUtcFromString,
  }),
  rulingPlanets: Schema.OptionFromOptionalKey(Ruling),
  ...Judgment.fields,
  memory: MemoryReport,
});
export interface JudgeResult extends Schema.Schema.Type<typeof JudgeResult> {}

export const judgeResult = Effect.fn("Ascendant.judgeResult")(function* (input: JudgeInput) {
  const event = yield* Option.match(findKpEvent(input.event), {
    onNone: () =>
      Effect.fail(
        new UnknownEvent({ event: input.event, message: `Unknown event ${input.event}` }),
      ),
    onSome: Effect.succeed,
  });
  const person = yield* readStoredPerson(input.name);
  const birth = yield* decodeMoment(person.moment);
  const recorded = yield* kpChartAt(person, birth);

  const from = yield* decodeMoment(input.from);
  const to = DateTime.addDuration(
    from,
    Duration.days((input.years ?? DEFAULT_YEARS) * DAYS_PER_YEAR),
  );

  const stored =
    (input.useMemory ?? true)
      ? Option.some(yield* readMemoryOrEmpty(person.name))
      : Option.none<Effect.Success<ReturnType<typeof readMemoryOrEmpty>>>();
  const past = Option.match(stored, {
    onNone: () => emptyMemory.events,
    onSome: ({ memory }) => memory.events,
  });
  const span = { from: birth, to: from };
  const fits = Arr.map(past, (entry) =>
    fitPastEvent(recorded.facts, recorded.periods, entry, span),
  );

  const windowMinutes = input.rectifyMinutes ?? DEFAULT_RECTIFY_MINUTES;
  const offsets =
    past.length >= MIN_PAST_EVENTS && windowMinutes > 0
      ? Arr.range(-windowMinutes, windowMinutes)
      : [];
  const trials = yield* Effect.forEach(offsets, (offsetMinutes) =>
    (offsetMinutes === 0
      ? Effect.succeed(recorded)
      : kpChartAt(person, DateTime.add(birth, { minutes: offsetMinutes }))
    ).pipe(
      Effect.map((chart) => ({
        offsetMinutes,
        score: Arr.reduce(
          past,
          0,
          (sum, entry) => sum + scoreFit(fitPastEvent(chart.facts, chart.periods, entry, span)),
        ),
      })),
    ),
  );
  const birthTime = checkBirthTime(trials, past.length, windowMinutes);

  const ruling = yield* Option.match(Option.fromUndefinedOr(input.judgmentMoment), {
    onNone: () => Effect.succeed(Option.none<Ruling>()),
    onSome: (moment) =>
      Effect.map(
        rulingPlanetsWorkflow(moment, person.latitude, person.longitude),
        ({ moment: at, rulingPlanets }) =>
          Option.some<Ruling>({
            moment: at,
            planets: Arr.dedupe(Arr.fromIterable<Planet>(rulingPlanets ?? [])),
          }),
      ),
  });

  const sky = yield* skyBetween(from, to, TRANSIT_STEP_DAYS);
  const judgment = judgeKp(recorded.facts, event, recorded.periods, sky, {
    from,
    to,
    limit: input.limit ?? DEFAULT_LIMIT,
    rulingPlanets: Option.map(ruling, ({ planets }) => planets),
    occurred: pipe(
      past,
      Arr.filter((entry) => entry.event.id === event.id),
      Arr.map((entry) => entry.noonUtc),
    ),
  });

  const result: JudgeResult = {
    person: { name: person.name },
    calculation: calculationContext("KP", KpAstroParams),
    window: { from, to },
    rulingPlanets: ruling,
    ...judgment,
    confidence: Option.match(stored, {
      onNone: () => judgment.confidence,
      onSome: () => confidenceWithMemory(judgment.confidence, birthTime, fits),
    }),
    memory: Option.match(stored, {
      onNone: () => ({ status: "not-used" as const }),
      onSome: ({ file, found, memory }) => ({
        file,
        status: !found
          ? ("missing" as const)
          : past.length === 0
            ? ("empty" as const)
            : ("used" as const),
        used: Arr.map(past, (entry) => ({
          line: entry.line,
          date: entry.date,
          event: entry.event.id,
          message: entry.message,
        })),
        ignored: memory.ignored,
        hindcast: fits,
        birthTime,
      }),
    }),
  };
  return result;
});

export const judgeWorkflow = Effect.fn("Ascendant.judge")(function* (input: JudgeInput) {
  return yield* Effect.orDie(Schema.encodeEffect(JudgeResult)(yield* judgeResult(input)));
});

export const listEvents = () => ({
  events: Arr.map(KP_EVENTS, ({ id, label, primary, supporting, parenthesised }) => ({
    id,
    label,
    primary,
    supporting: supporting.join(","),
    parenthesised: parenthesised.join(",") || "-",
  })),
  refused: Arr.map(EXCLUDED_KP_EVENTS, ({ label, primary, reason }) => ({
    label,
    primary,
    reason,
  })),
  engineChoices: Arr.map(Object.entries(ENGINE_CHOICES), ([choice, statement]) => ({
    choice,
    statement,
  })),
});
