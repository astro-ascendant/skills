import { Swisseph } from "astro-ascendant";
import { Array as Arr, DateTime, Effect, Layer, Option, Order, Random, Schema } from "effect";

import {
  decodeMoment,
  KpAstroParamsLayer,
  PlatformLayer,
} from "../skills/ascendant/tools/common.ts";
import { kpChartAt, skyBetween, TRANSIT_STEP_DAYS } from "../skills/ascendant/tools/judge.ts";
import {
  houseGroup,
  judgePromise,
  KP_JUDGE_VERSION,
  rankSignificators,
  timingPlanets,
  type KpFacts,
  type KpPeriod,
  type Planet,
  type Verdict,
} from "../skills/ascendant/tools/kp-judge.ts";
import { AGE_BINS, YEAR_MS, type Case, type Dataset } from "./dataset.ts";
import {
  baseRate,
  bootstrapMean,
  brierScore,
  combine,
  engineForecast,
  inTopYears,
  logScore,
  transitAgreementShareByAge,
  transitAgreesAt,
  uniform,
  type Distribution,
  type Interval,
} from "./forecast.ts";

export const EvalLayer = Layer.mergeAll(PlatformLayer, KpAstroParamsLayer, Swisseph.SwissephLayer);

export interface EvaluateOptions {
  readonly shiftHours: number;
  readonly seed: number;
  readonly skyStepDays: number;
}

export const DEFAULT_OPTIONS: EvaluateOptions = {
  shiftHours: 6,
  seed: 20261120,
  skyStepDays: TRANSIT_STEP_DAYS,
};

const TOP_YEARS = AGE_BINS / 10;

const MODELS = [
  "uniform",
  "base-rate",
  "engine",
  "engine-shuffled-chart",
  "engine-shifted-birth-time",
  "engine-with-base-rate",
  "shuffled-chart-with-base-rate",
] as const;
type Model = (typeof MODELS)[number];

type Difference = "better" | "worse" | "no measurable difference";

interface ChartOf {
  readonly facts: KpFacts;
  readonly periods: ReadonlyArray<KpPeriod>;
  readonly birth: DateTime.Utc;
}

export class DatasetTooSmall extends Schema.TaggedError<DatasetTooSmall>()("DatasetTooSmall", {
  message: Schema.String,
}) {}

const mean = (values: ReadonlyArray<number>): number =>
  values.length === 0 ? 0 : Arr.reduce(values, 0, (sum, value) => sum + value) / values.length;

const round = (value: number): number => Math.round(value * 10000) / 10000;

const differenceOf = (interval: Interval): Difference =>
  interval.low > 0 ? "better" : interval.high < 0 ? "worse" : "no measurable difference";

const VERDICTS: ReadonlyArray<Verdict> = ["promised", "mixed", "denied", "not-indicated"];

const countVerdicts = (verdicts: ReadonlyArray<Verdict>) =>
  Object.fromEntries(
    VERDICTS.map((verdict) => [verdict, verdicts.filter((entry) => entry === verdict).length]),
  );

export const evaluate = Effect.fn("Eval.evaluate")(function* (
  dataset: Dataset,
  options: EvaluateOptions = DEFAULT_OPTIONS,
) {
  const { persons, cases } = dataset;
  if (persons.length < 2 || cases.length === 0) {
    return yield* new DatasetTooSmall({
      message: "The dataset needs at least two people and one usable event",
    });
  }

  const chartsOf = (shiftHours: number) =>
    Effect.forEach(persons, (person) =>
      Effect.gen(function* () {
        const birth = DateTime.add(yield* decodeMoment(person.birth), { hours: shiftHours });
        const chart = yield* kpChartAt(person, birth);
        return { ...chart, birth } satisfies ChartOf;
      }),
    );
  const own = yield* chartsOf(0);
  const shifted = yield* chartsOf(options.shiftHours);
  const chartAt = (charts: ReadonlyArray<ChartOf>, index: number): Option.Option<ChartOf> =>
    Arr.get(charts, index % charts.length);

  const births = Arr.map([...own, ...shifted], (chart) => DateTime.toEpochMillis(chart.birth));
  const sky = yield* skyBetween(
    DateTime.makeUnsafe(Math.min(...births)),
    DateTime.makeUnsafe(Math.max(...births) + AGE_BINS * YEAR_MS),
    options.skyStepDays,
  );

  const flat = uniform();
  const scoreCase = (entry: Case, mine: ChartOf, other: ChartOf, later: ChartOf) => {
    const timingPlanetsOf = (chart: ChartOf): ReadonlyArray<Planet> =>
      timingPlanets(rankSignificators(chart.facts, houseGroup(entry.event), Option.none()));
    const shareByAgeOf = (chart: ChartOf): ReadonlyArray<number> =>
      transitAgreementShareByAge(timingPlanetsOf(chart), chart.periods, chart.birth, sky);
    const mineShare = shareByAgeOf(mine);
    const otherShare = shareByAgeOf(other);
    const usual = baseRate(cases, entry.event.id, entry.personIndex);
    const engine = engineForecast(mineShare);
    const shuffled = engineForecast(otherShare);
    const forecasts: Readonly<Record<Model, Distribution>> = {
      uniform: flat,
      "base-rate": usual,
      engine,
      "engine-shuffled-chart": shuffled,
      "engine-shifted-birth-time": engineForecast(shareByAgeOf(later)),
      "engine-with-base-rate": combine(engine, usual),
      "shuffled-chart-with-base-rate": combine(shuffled, usual),
    };
    const hitIn = (chart: ChartOf): boolean =>
      transitAgreesAt(
        timingPlanetsOf(chart),
        chart.periods,
        DateTime.add(chart.birth, {
          milliseconds: DateTime.toEpochMillis(entry.noonUtc) - DateTime.toEpochMillis(mine.birth),
        }),
        sky,
      );
    const chanceIn = (share: ReadonlyArray<number>): number => mean(share);
    const verdictIn = (chart: ChartOf): Verdict =>
      judgePromise(chart.facts, entry.event, houseGroup(entry.event)).verdict;
    return {
      entry,
      forecasts,
      hit: { own: hitIn(mine), shuffled: hitIn(other) },
      chance: { own: chanceIn(mineShare), shuffled: chanceIn(otherShare) },
      verdict: { own: verdictIn(mine), shuffled: verdictIn(other) },
    };
  };
  const scored = Arr.getSomes(
    Arr.map(cases, (entry) =>
      Option.map(
        Option.all([
          chartAt(own, entry.personIndex),
          chartAt(own, entry.personIndex + 1),
          chartAt(shifted, entry.personIndex),
        ]),
        ([mine, other, later]) => scoreCase(entry, mine, other, later),
      ),
    ),
  );

  const models = MODELS.map((model) => ({
    model,
    logScore: round(mean(scored.map((row) => logScore(row.forecasts[model], row.entry.ageYears)))),
    brier: round(mean(scored.map((row) => brierScore(row.forecasts[model], row.entry.ageYears)))),
    topYearsRate: round(
      mean(
        scored.map((row) =>
          inTopYears(row.forecasts[model], row.entry.ageYears, TOP_YEARS) ? 1 : 0,
        ),
      ),
    ),
  }));

  const compare = (name: string, question: string, better: Model, baseline: Model) => {
    const groups = persons.map((_, person) =>
      scored
        .filter((row) => row.entry.personIndex === person)
        .map(
          (row) =>
            logScore(row.forecasts[better], row.entry.ageYears) -
            logScore(row.forecasts[baseline], row.entry.ageYears),
        ),
    );
    return Effect.map(bootstrapMean(groups), (interval) => ({
      name,
      question,
      logScoreGain: round(interval.mean),
      low: round(interval.low),
      high: round(interval.high),
      result: differenceOf(interval),
    }));
  };
  const comparisons = yield* Effect.all([
    compare(
      "engine vs shuffled chart",
      "Does a person's own chart forecast their events better than another person's chart?",
      "engine",
      "engine-shuffled-chart",
    ),
    compare(
      "engine vs shifted birth time",
      "Does the recorded birth time forecast better than a shifted one?",
      "engine",
      "engine-shifted-birth-time",
    ),
    compare(
      "engine with base rate vs base rate",
      "Does the chart add anything to knowing the usual age for the event?",
      "engine-with-base-rate",
      "base-rate",
    ),
    compare("engine vs uniform", "Does the engine beat knowing nothing?", "engine", "uniform"),
  ]).pipe(Random.withSeed(String(options.seed)));

  const hits = (key: "own" | "shuffled") => {
    const count = scored.filter((row) => row.hit[key]).length;
    const expected = scored.reduce((sum, row) => sum + row.chance[key], 0);
    return {
      hits: count,
      expectedByChance: round(expected),
      rate: round(count / scored.length),
      chanceRate: round(expected / scored.length),
    };
  };

  const eventIds = Arr.sort(Arr.dedupe(Arr.map(cases, (entry) => entry.event.id)), Order.String);
  const byEvent = eventIds.map((id) => {
    const rows = scored.filter((row) => row.entry.event.id === id);
    const score = (model: Model) =>
      round(mean(rows.map((row) => logScore(row.forecasts[model], row.entry.ageYears))));
    return {
      event: id,
      cases: rows.length,
      engine: score("engine"),
      shuffledChart: score("engine-shuffled-chart"),
      baseRate: score("base-rate"),
      meanCoverage: round(mean(rows.map((row) => row.chance.own))),
    };
  });

  const [versusShuffled, , versusBaseRate] = comparisons;
  const conclusion =
    versusShuffled?.result === "better" && versusBaseRate?.result === "better"
      ? "The engine forecasts better with a person's own chart than with another's, and adds to the age base rate."
      : versusShuffled?.result === "better"
        ? "The engine forecasts better with a person's own chart than with another's, but does not add to the age base rate."
        : "No evidence that the chart carries information: the engine does no better with a person's own chart than with another person's.";

  return {
    engine: KP_JUDGE_VERSION,
    dataset: { persons: persons.length, cases: cases.length, dropped: dataset.problems.length },
    options,
    conclusion,
    comparisons,
    models,
    periodHits: { own: hits("own"), shuffledChart: hits("shuffled") },
    promise: {
      own: countVerdicts(scored.map((row) => row.verdict.own)),
      shuffledChart: countVerdicts(scored.map((row) => row.verdict.shuffled)),
    },
    byEvent,
  };
});

export type Report = Effect.Success<ReturnType<typeof evaluate>>;

const table = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
): string =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

export function renderReport(report: Report, datasetName: string): string {
  const verdictRow = (label: string, counts: Record<string, number>) => [
    label,
    ...VERDICTS.map((verdict) => counts[verdict] ?? 0),
  ];
  return [
    `# Evaluation: ${report.engine} on ${datasetName}`,
    "",
    `${report.dataset.persons} people, ${report.dataset.cases} events, ${report.dataset.dropped} lines or events dropped.`,
    "",
    `**${report.conclusion}**`,
    "",
    "## Comparisons",
    "",
    "Gain is the mean difference in log score; above 0 favours the first model. The range is a 95% interval from resampling people. A result is called only when the whole range is on one side of 0.",
    "",
    table(
      ["Comparison", "Gain", "Range", "Result"],
      report.comparisons.map((row) => [
        row.name,
        row.logScoreGain,
        `${row.low} to ${row.high}`,
        row.result,
      ]),
    ),
    "",
    "## Models",
    "",
    `Log score: higher is better. Brier: lower is better. Top years: share of events in the forecast's ${TOP_YEARS} most likely years of ${AGE_BINS}.`,
    "",
    table(
      ["Model", "Log score", "Brier", "Top years"],
      report.models.map((row) => [row.model, row.logScore, row.brier, row.topYearsRate]),
    ),
    "",
    "## Period hits",
    "",
    "How often the event date fell in a conjoined period, against how often that would happen by chance given how much of life such periods cover.",
    "",
    table(
      ["Chart", "Hits", "Expected by chance", "Hit rate", "Chance rate"],
      [
        ["Own", ...Object.values(report.periodHits.own)],
        ["Shuffled", ...Object.values(report.periodHits.shuffledChart)],
      ],
    ),
    "",
    "## Promise rule",
    "",
    "What the promise rule says about events that did happen. A rule that says the same for another person's chart is not telling people apart.",
    "",
    table(
      ["Chart", ...VERDICTS],
      [verdictRow("Own", report.promise.own), verdictRow("Shuffled", report.promise.shuffledChart)],
    ),
    "",
    "## By event",
    "",
    table(
      ["Event", "Cases", "Engine", "Shuffled chart", "Base rate", "Mean coverage"],
      report.byEvent.map((row) => [
        row.event,
        row.cases,
        row.engine,
        row.shuffledChart,
        row.baseRate,
        row.meanCoverage,
      ]),
    ),
    "",
  ].join("\n");
}
