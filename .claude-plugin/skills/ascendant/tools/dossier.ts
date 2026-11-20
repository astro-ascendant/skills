import { CharaKarakas, Chart, Dasha, Ephemeris, Karakamsha } from "astro-ascendant";
import { Array as Arr, DateTime, Effect, FileSystem, Option, Path, pipe, Schema } from "effect";

import {
  decodeMoment,
  KpAstroParamsLayer,
  personsDirectory,
  type PersonName,
  readStoredPerson,
  KpAstroParams,
  VedicAstroParams,
  VedicAstroParamsLayer,
} from "./common.ts";
import { findKpEvent, KP_EVENTS, type House } from "./events.ts";
import {
  Fact,
  antaraRunningAt,
  CandidateRow,
  forHouses,
  jaiminiFacts,
  kpHouseOf,
  kpChartFacts,
  lordProfile,
  memoryFacts,
  parashariChartFacts,
  parseTransitFactId,
  parsePeriodId,
  PeriodRow,
  periodRows,
  resolvePeriod,
  runningPeriods,
  sharedWithRecord,
  signOf,
  SLOW_PLANETS,
  strictRuleFact,
  transitFacts,
  vargaFacts,
  type Calendar,
  type Depth,
  type SignSample,
  type Timelines,
  type SlowPlanet,
} from "./evidence.ts";
import { kpFactsOf, readMemoryOrEmpty, UnknownEvent } from "./judge.ts";
import { houseGroup } from "./kp-judge.ts";
import { RankedWindow, rankWindows, RANKING_BASIS, type RankTopic } from "./ranking.ts";
import type { EvidenceInput, VerifyInput } from "./tool-specs.ts";
import { Verification, verifyAnswer } from "./verify-answer.ts";

const DEFAULT_VARGAS = [9, 10] as const;
const MAX_PERIOD_ROWS = 150;
const TRANSIT_STEP_DAYS = 3;
const MAX_TRANSIT_YEARS = 40;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
const FILE_ID_PREFIX = "file:";

export class UnknownPeriod extends Schema.TaggedError<UnknownPeriod>()("UnknownPeriod", {
  message: Schema.String,
}) {}

export class WindowIncomplete extends Schema.TaggedError<WindowIncomplete>()("WindowIncomplete", {
  message: Schema.String,
}) {}

const loadCharts = Effect.fn("Ascendant.loadCharts")(function* (name: PersonName) {
  const person = yield* readStoredPerson(name);
  const birth = yield* decodeMoment(person.moment);
  const moment = Chart.Moment.make({ date: birth });
  const params = {
    moment,
    latitude: person.latitude,
    longitude: person.longitude,
    ...(person.sex !== undefined ? { sex: person.sex } : {}),
  };
  const vedic = yield* Chart.generate(params, Chart.Division.literals).pipe(
    Effect.provide(VedicAstroParamsLayer),
  );
  const kp = yield* Chart.generate(params, []).pipe(Effect.provide(KpAstroParamsLayer));
  const rashi = vedic.charts[0];
  const kpD1 = kp.charts[0];
  const kpFacts = yield* kpFactsOf(kpD1);
  const timelines: Timelines = {
    kp: yield* Dasha.calculate(moment, kp.placements),
    par: yield* Dasha.calculate(moment, vedic.placements),
  };
  const kpCusps = Arr.map(Chart.Houses.literals, (house) => kpD1.houses[house].cusp);
  const memory = yield* readMemoryOrEmpty(name);
  const karakas = yield* CharaKarakas.calculate(vedic.placements).pipe(
    Effect.provide(VedicAstroParamsLayer),
  );
  const karakamsha = yield* Karakamsha.calculate(vedic.placements).pipe(
    Effect.provide(VedicAstroParamsLayer),
  );
  const jaimini = {
    karakas: Arr.map(CharaKarakas.Roles.literals, (role) => ({
      role,
      planets: Arr.map(karakas.assignments[role], (entry) => entry.planet),
    })),
    karakamsha: Arr.map(karakamsha.placements, ({ planet, sign }) => ({ planet, sign })),
  };
  return {
    name,
    birth,
    vedic,
    rashi,
    kpD1,
    kpFacts,
    kpCusps,
    timelines,
    jaimini,
    memory: memory.memory,
  };
});

type Charts = Effect.Success<ReturnType<typeof loadCharts>>;

const chartFactsOf = (charts: Charts, vargas: ReadonlyArray<number>) => [
  ...kpChartFacts(charts.kpD1, charts.kpFacts),
  ...parashariChartFacts(charts.rashi),
  ...pipe(
    charts.vedic.charts,
    Arr.filter((chart) => chart.division !== 1 && Arr.contains(vargas, chart.division)),
    Arr.flatMap((chart) => vargaFacts(chart.division, chart, charts.rashi)),
  ),
  ...jaiminiFacts(charts.jaimini),
  ...memoryFacts(charts.memory, (moment) =>
    Arr.map(CALENDARS, (calendar) =>
      antaraRunningAt(charts.timelines[calendar], calendar, moment, charts.birth),
    ).join(", "),
  ),
];

const CALENDARS: ReadonlyArray<Calendar> = ["kp", "par"];

const signSamples = Effect.fn("Ascendant.signSamples")(function* (
  planet: SlowPlanet,
  moments: ReadonlyArray<DateTime.Utc>,
  kpCusps: ReadonlyArray<number>,
) {
  const ephemeris = yield* Ephemeris.Ephemeris;
  return yield* Effect.forEach(moments, (at) =>
    Effect.gen(function* () {
      const julianDay = yield* ephemeris.dateToJulianDay(at);
      const parashari = yield* ephemeris.calculatePosition(
        julianDay,
        planet,
        VedicAstroParams.ayanamsa,
      );
      const kp = yield* ephemeris.calculatePosition(julianDay, planet, KpAstroParams.ayanamsa);
      return {
        at,
        sign: signOf(parashari.longitude),
        kpHouse: kpHouseOf(kp.longitude, kpCusps),
      } satisfies SignSample;
    }),
  );
});

const slowTransitFacts = Effect.fn("Ascendant.slowTransitFacts")(function* (
  charts: Charts,
  from: DateTime.Utc,
  to: DateTime.Utc,
) {
  const days = Math.min(
    (DateTime.toEpochMillis(to) - DateTime.toEpochMillis(from)) / MILLIS_PER_DAY,
    MAX_TRANSIT_YEARS * 365.25,
  );
  const moments = Arr.makeBy(Math.max(1, Math.ceil(days / TRANSIT_STEP_DAYS)), (index) =>
    DateTime.add(from, { days: index * TRANSIT_STEP_DAYS }),
  );
  const moonSign = pipe(
    Chart.Houses.literals,
    Arr.findFirst((house) =>
      Arr.some(charts.rashi.houses[house].planets, (planet) => planet.name === "Moon"),
    ),
    Option.match({
      onNone: () => charts.rashi.houses[1].sign,
      onSome: (house) => charts.rashi.houses[house].sign,
    }),
  );
  const perPlanet = yield* Effect.forEach(SLOW_PLANETS, (planet) =>
    Effect.map(signSamples(planet, moments, charts.kpCusps), (samples) =>
      transitFacts(planet, samples, charts.rashi.houses[1].sign, moonSign),
    ),
  );
  return Arr.flatten(perPlanet);
});

const MAX_RANKED_ROWS = 15;

const topicOf = (
  event: Option.Option<{ readonly primary: House }>,
  group: Option.Option<{
    readonly conducive: ReadonlyArray<House>;
    readonly detrimental: ReadonlyArray<House>;
  }>,
  asked: ReadonlyArray<House>,
): Option.Option<RankTopic> =>
  Option.match(Option.all({ event, group }), {
    onSome: ({ event: found, group: houses }) =>
      Option.some({
        conducive: houses.conducive,
        detrimental: houses.detrimental,
        primary: found.primary,
      }),
    onNone: () =>
      Option.map(Arr.head(asked), (primary) => ({ conducive: asked, detrimental: [], primary })),
  });

const lordsAtRecordedEvents = (charts: Charts, calendar: Calendar): ReadonlyArray<string> =>
  pipe(
    [...charts.memory.events, ...charts.memory.notes],
    Arr.flatMap((entry) =>
      Option.match(
        parsePeriodId(
          antaraRunningAt(charts.timelines[calendar], calendar, entry.noonUtc, charts.birth),
        ),
        { onNone: () => [], onSome: (parsed) => parsed.lords },
      ),
    ),
    Arr.dedupe,
  );

const rankingFor = Effect.fn("Ascendant.rankingFor")(function* (
  charts: Charts,
  topic: RankTopic,
  window: { readonly start: DateTime.Utc; readonly end: DateTime.Utc },
  depth: Depth,
) {
  const days = Math.min(
    (DateTime.toEpochMillis(window.end) - DateTime.toEpochMillis(window.start)) / MILLIS_PER_DAY,
    MAX_TRANSIT_YEARS * 365.25,
  );
  const moments = Arr.makeBy(Math.max(1, Math.ceil(days / TRANSIT_STEP_DAYS)), (index) =>
    DateTime.add(window.start, { days: index * TRANSIT_STEP_DAYS }),
  );
  return rankWindows({
    timelines: charts.timelines,
    depth,
    window,
    birth: charts.birth,
    facts: charts.kpFacts,
    rashi: charts.rashi,
    topic,
    slowSamples: {
      Jupiter: yield* signSamples("Jupiter", moments, charts.kpCusps),
      Saturn: yield* signSamples("Saturn", moments, charts.kpCusps),
    },
    lordsAtRecordedEvents: {
      kp: lordsAtRecordedEvents(charts, "kp"),
      par: lordsAtRecordedEvents(charts, "par"),
    },
  });
});

export const EvidenceResult = Schema.Struct({
  person: Schema.Struct({ name: Schema.String, birth: Schema.DateTimeUtcFromString }),
  basis: Schema.Array(Schema.String),
  topic: Schema.Struct({
    houses: Schema.Array(Schema.Int),
    note: Schema.String,
  }),
  facts: Schema.Array(Fact),
  periods: Schema.Struct({
    depth: Schema.String,
    truncated: Schema.Boolean,
    kp: Schema.Array(PeriodRow),
    parashari: Schema.Array(PeriodRow),
  }),
  ranking: Schema.Struct({
    depth: Schema.String,
    basis: Schema.Array(Schema.String),
    windows: Schema.Int,
    rows: Schema.Array(RankedWindow),
  }),
  transits: Schema.Array(Fact),
  candidates: Schema.Array(CandidateRow),
  running: Schema.Struct({
    at: Schema.String,
    periods: Schema.Array(PeriodRow),
    transits: Schema.Array(Fact),
  }),
});

const BASIS = [
  "KP facts use the KP ayanamsa and Placidus cusps; Parashari and divisional facts use Lahiri and whole-sign houses, so a planet near a boundary can sit in different houses in the two",
  "Each school has its own Vimshottari calendar, because each measures the Moon from a different zero point: the same sub-period can fall some weeks apart in the two. A period id carries its calendar, for example kp:Ketu-Venus-Sun or par:Ketu-Venus-Sun. Weigh KP facts on kp: periods and Parashari facts on par: periods, and compare the dates the two arrive at",
  "A transit names its house in both systems, because whole-sign houses (Parashari) and Placidus cusps (KP) can differ. Say which one you mean",
  "Aspects are whole-sign: every planet aspects the 7th from itself; Mars also the 4th and 8th, Jupiter the 5th and 9th, Saturn the 3rd and 10th. Aspects of Rahu and Ketu are not listed",
  "Facts are placements and rule readings, never conclusions. Weigh them with the guidebook",
];

export const evidenceWorkflow = Effect.fn("Ascendant.evidence")(function* (input: EvidenceInput) {
  const charts = yield* loadCharts(input.name);
  const event = yield* input.event === undefined
    ? Effect.succeed(Option.none())
    : pipe(
        findKpEvent(input.event),
        Option.match({
          onNone: () =>
            Effect.fail(
              new UnknownEvent({ event: input.event ?? "", message: "Unknown event id" }),
            ),
          onSome: (found) => Effect.succeed(Option.some(found)),
        }),
      );
  const group = Option.map(event, houseGroup);
  const houses: ReadonlyArray<House> = Arr.dedupe([
    ...(input.houses ?? []),
    ...Option.match(group, {
      onNone: () => [],
      onSome: (found) => [...found.conducive, ...found.parenthesised, ...found.detrimental],
    }),
  ]);

  if ((input.from === undefined) !== (input.to === undefined)) {
    return yield* new WindowIncomplete({
      message: "Give both --from and --to to list periods, or neither for chart facts alone",
    });
  }
  const window =
    input.from !== undefined && input.to !== undefined
      ? Option.some({
          start: yield* decodeMoment(input.from),
          end: yield* decodeMoment(input.to),
        })
      : Option.none();
  const depth = input.depth ?? "bhukti";
  const rowsIn = (calendar: Calendar) =>
    Option.match(window, {
      onNone: () => [],
      onSome: (span) => periodRows(charts.timelines[calendar], calendar, depth, span, charts.birth),
    });
  const ranked = yield* Option.match(
    Option.all({ span: window, topic: topicOf(event, group, input.houses ?? []) }),
    {
      onNone: () => Effect.succeed([] as ReadonlyArray<RankedWindow>),
      onSome: ({ span, topic }) => rankingFor(charts, topic, span, depth),
    },
  );
  const kpRows = rowsIn("kp");
  const parashariRows = rowsIn("par");
  const transits = yield* Option.match(window, {
    onNone: () => Effect.succeed([] as ReadonlyArray<Fact>),
    onSome: (span) => slowTransitFacts(charts, span.start, span.end),
  });

  const candidates = yield* Effect.forEach(input.compare ?? [], (id) =>
    Effect.gen(function* () {
      const span = yield* pipe(
        resolvePeriod(charts.timelines, id, charts.birth),
        Option.match({
          onNone: () =>
            Effect.fail(
              new UnknownPeriod({
                message: `${id} is not a period of this person; use ids as the periods list gives them`,
              }),
            ),
          onSome: Effect.succeed,
        }),
      );
      const parsed = Option.getOrElse(parsePeriodId(id), () => ({
        calendar: "kp" as Calendar,
        lords: [] as ReadonlyArray<string>,
      }));
      const other: Calendar = parsed.calendar === "kp" ? "par" : "kp";
      const depthOfId = Arr.findFirst(
        ["dasha", "bhukti", "antara", "sookshma"] as const,
        (_, index) => index + 1 === parsed.lords.length,
      );
      const lords = Arr.dedupe(
        Arr.getSomes(
          Arr.map(parsed.lords, (name) =>
            Arr.findFirst(Chart.Planets.literals, (planet) => planet === name),
          ),
        ),
      );
      return {
        id,
        start: span.start,
        end: span.end,
        ageAtStart:
          periodRows(
            charts.timelines[parsed.calendar],
            parsed.calendar,
            "sookshma",
            span,
            charts.birth,
          )[0]?.ageAtStart ?? 0,
        lords: Arr.map(lords, (planet) =>
          lordProfile(planet, parsed.calendar, charts.kpFacts, charts.rashi, houses),
        ),
        sameDatesInOtherCalendar: Option.match(depthOfId, {
          onNone: () => [],
          onSome: (depthName) =>
            Arr.map(
              periodRows(charts.timelines[other], other, depthName, span, charts.birth),
              (row) =>
                `${row.id} from ${DateTime.formatIsoDateUtc(row.start)} to ${DateTime.formatIsoDateUtc(row.end)}`,
            ),
        }),
        record: sharedWithRecord(parsed.lords, charts.memory, (moment) =>
          antaraRunningAt(charts.timelines[parsed.calendar], parsed.calendar, moment, charts.birth),
        ),
        transits: yield* slowTransitFacts(charts, span.start, span.end),
      };
    }),
  );

  const at = input.at === undefined ? Option.none() : Option.some(yield* decodeMoment(input.at));
  const runningTransits = yield* Option.match(at, {
    onNone: () => Effect.succeed([] as ReadonlyArray<Fact>),
    onSome: (moment) =>
      slowTransitFacts(charts, moment, DateTime.add(moment, { days: TRANSIT_STEP_DAYS })),
  });

  return yield* Effect.orDie(
    Schema.encodeEffect(EvidenceResult)({
      person: { name: input.name, birth: charts.birth },
      basis: BASIS,
      topic: {
        houses,
        note: Option.match(group, {
          onNone: () =>
            houses.length === 0
              ? "No topic given: facts for all twelve houses"
              : "Facts for the houses asked for, and for every planet",
          onSome: (found) =>
            `Guidebook house group: conducive ${found.conducive.join(", ")}; extra ${found.parenthesised.join(", ") || "none"}; detrimental ${found.detrimental.join(", ") || "none"}`,
        }),
      },
      facts: [
        ...Option.match(event, {
          onNone: () => [],
          onSome: (found) => forHouses([strictRuleFact(charts.kpFacts, found)], []),
        }),
        ...forHouses(chartFactsOf(charts, input.vargas ?? DEFAULT_VARGAS), houses),
      ],
      periods: {
        depth,
        truncated: Math.max(kpRows.length, parashariRows.length) > MAX_PERIOD_ROWS,
        kp: Arr.take(kpRows, MAX_PERIOD_ROWS),
        parashari: Arr.take(parashariRows, MAX_PERIOD_ROWS),
      },
      ranking: {
        depth,
        basis: ranked.length === 0 ? [] : RANKING_BASIS,
        windows: ranked.length,
        rows: Arr.take(ranked, MAX_RANKED_ROWS),
      },
      transits,
      candidates,
      running: {
        at: input.at ?? "not asked for",
        periods: Option.match(at, {
          onNone: () => [],
          onSome: (moment) =>
            Arr.flatMap(CALENDARS, (calendar) =>
              runningPeriods(charts.timelines[calendar], calendar, moment, charts.birth),
            ),
        }),
        transits: runningTransits,
      },
    }),
  );
});

const transitFactHolds = Effect.fn("Ascendant.transitFactHolds")(function* (
  id: string,
  kpCusps: ReadonlyArray<number>,
) {
  return yield* Option.match(parseTransitFactId(id), {
    onNone: () => Effect.succeed(false),
    onSome: ({ planet, sign, at }) =>
      Effect.map(signSamples(planet, [at], kpCusps), (samples) =>
        Arr.some(samples, (sample) => sample.sign === sign),
      ),
  });
});

export const verifyWorkflow = Effect.fn("Ascendant.verify")(function* (input: VerifyInput) {
  const charts = yield* loadCharts(input.name);
  const asOf = DateTime.make(`${input.worksheet.asOf ?? ""}T12:00:00Z`);
  const cited = Arr.dedupe(
    Arr.flatMap(input.worksheet.parts, (part) => [
      ...part.for,
      ...part.against,
      ...Arr.flatMap(part.candidates ?? [], (candidate) => [
        ...candidate.for,
        ...candidate.against,
      ]),
    ]),
  );
  const transitIds = Arr.getSomes(
    yield* Effect.forEach(
      Arr.filter(cited, (id) => id.startsWith("transit.")),
      (id) =>
        Effect.map(transitFactHolds(id, charts.kpCusps), (holds) =>
          holds ? Option.some(id) : Option.none(),
        ),
    ),
  );
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const personDirectory = path.join(yield* personsDirectory, charts.name);
  const fileIds = Arr.getSomes(
    yield* Effect.forEach(
      Arr.filter(cited, (id) => id.startsWith(FILE_ID_PREFIX)),
      (id) => {
        const relative = id.slice(FILE_ID_PREFIX.length);
        return relative.includes("..") || path.isAbsolute(relative)
          ? Effect.succeed(Option.none<string>())
          : Effect.map(
              Effect.orElseSucceed(fs.exists(path.join(personDirectory, relative)), () => false),
              (found) => (found ? Option.some(id) : Option.none<string>()),
            );
      },
    ),
  );
  const everyVarga = Arr.map(charts.vedic.charts, (chart) => chart.division);
  const periods = Arr.getSomes(
    Arr.map(
      Arr.dedupe(
        Arr.flatMap(input.worksheet.parts, (part) => [
          ...(part.periods ?? []),
          ...Arr.flatMap(part.candidates ?? [], (candidate) => candidate.periods),
        ]),
      ),
      (id) =>
        Option.map(resolvePeriod(charts.timelines, id, charts.birth), (span) => ({
          id,
          ...span,
          running: Option.exists(
            asOf,
            (moment) =>
              DateTime.isLessThanOrEqualTo(span.start, moment) &&
              DateTime.isLessThan(moment, span.end),
          ),
        })),
    ),
  );
  const ranking = yield* Effect.forEach(input.worksheet.parts, (part) =>
    Effect.gen(function* () {
      const event = Option.flatMap(Option.fromUndefinedOr(part.topic?.event), findKpEvent);
      const asked = Arr.filter(Chart.Houses.literals, (house) =>
        Arr.contains(part.topic?.houses ?? [], house),
      );
      const ready = Option.all({
        topic: topicOf(event, Option.map(event, houseGroup), asked),
        start: Option.flatMap(Option.fromUndefinedOr(part.searched), (searched) =>
          DateTime.make(`${searched.from}T00:00:00Z`),
        ),
        end: Option.flatMap(Option.fromUndefinedOr(part.searched), (searched) =>
          DateTime.make(`${searched.to}T00:00:00Z`),
        ),
      });
      return yield* Option.match(ready, {
        onNone: () => Effect.succeed(Option.none<ReadonlyArray<RankedWindow>>()),
        onSome: ({ topic, start, end }) =>
          Effect.map(
            rankingFor(charts, topic, { start, end }, part.depth ?? "bhukti"),
            Option.some,
          ),
      });
    }),
  );
  const verification = verifyAnswer(input.draft, input.worksheet, {
    ranking: Arr.map(ranking, (rows) =>
      Option.map(rows, (found) => Arr.map(found, ({ id, rank, rating }) => ({ id, rank, rating }))),
    ),
    knownFactIds: [
      ...Arr.map(chartFactsOf(charts, everyVarga), (fact) => fact.id),
      ...Arr.map(KP_EVENTS, (event) => `kp.rule.${event.id}`),
      ...transitIds,
      ...fileIds,
    ],
    periods,
    citableMoments: [
      charts.birth,
      ...Arr.map(charts.memory.events, (entry) => entry.noonUtc),
      ...Arr.map(charts.memory.notes, (entry) => entry.noonUtc),
      ...Option.toArray(asOf),
    ],
  });
  return yield* Effect.orDie(Schema.encodeEffect(Verification)(verification));
});
