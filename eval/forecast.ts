import { Array as Arr, DateTime, Effect, Option, Order, pipe, Random } from "effect";

import {
  transitAgreements,
  type KpPeriod,
  type Planet,
  type Sky,
} from "../skills/ascendant/tools/kp-judge.ts";
import { AGE_BINS, YEAR_MS, type Case } from "./dataset.ts";

export type Distribution = ReadonlyArray<number>;

const sum = (values: ReadonlyArray<number>): number =>
  Arr.reduce(values, 0, (total, value) => total + value);

const normalize = (weights: ReadonlyArray<number>): Distribution => {
  const total = sum(weights);
  return Arr.map(weights, (weight) => weight / total);
};

export const uniform = (): Distribution => normalize(Arr.makeBy(AGE_BINS, () => 1));

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export function transitAgreementShareByAge(
  timingPlanets: ReadonlyArray<Planet>,
  periodsInTimeOrder: ReadonlyArray<KpPeriod>,
  birth: DateTime.Utc,
  sky: Sky,
): ReadonlyArray<number> {
  const born = DateTime.toEpochMillis(birth);
  const lifeEnd = born + AGE_BINS * YEAR_MS;
  const samplesInLife = Arr.filter(sky.samples, (sample) => {
    const at = DateTime.toEpochMillis(sample.at);
    return at >= born && at < lifeEnd;
  });
  const agreementsByAge = Arr.groupBy(
    transitAgreements(timingPlanets, periodsInTimeOrder, { ...sky, samples: samplesInLife }),
    (agreement) =>
      String(Math.floor((DateTime.toEpochMillis(agreement.sample.at) - born) / YEAR_MS)),
  );
  const samplesPerYear = YEAR_MS / (sky.stepDays * MILLIS_PER_DAY);
  return Arr.makeBy(
    AGE_BINS,
    (ageYears) => (agreementsByAge[String(ageYears)]?.length ?? 0) / samplesPerYear,
  );
}

export const transitAgreesAt = (
  timingPlanets: ReadonlyArray<Planet>,
  periodsInTimeOrder: ReadonlyArray<KpPeriod>,
  moment: DateTime.Utc,
  sky: Sky,
): boolean =>
  pipe(
    Arr.head(sky.samples),
    Option.flatMap((firstSample) =>
      Arr.get(
        sky.samples,
        Math.floor(
          (DateTime.toEpochMillis(moment) - DateTime.toEpochMillis(firstSample.at)) /
            (sky.stepDays * MILLIS_PER_DAY),
        ),
      ),
    ),
    Option.exists(
      (sample) =>
        transitAgreements(timingPlanets, periodsInTimeOrder, { ...sky, samples: [sample] }).length >
        0,
    ),
  );

export const ZERO_PROBABILITY_GUARD = 0.01;

export const engineForecast = (coverage: ReadonlyArray<number>): Distribution =>
  normalize(Arr.map(coverage, (share) => share + ZERO_PROBABILITY_GUARD));

export function baseRate(
  cases: ReadonlyArray<Case>,
  eventId: string,
  excludedPersonIndex: number,
): Distribution {
  const ages = pipe(
    cases,
    Arr.filter((entry) => entry.event.id === eventId && entry.personIndex !== excludedPersonIndex),
    Arr.map((entry) => entry.ageYears),
  );
  return normalize(
    Arr.makeBy(AGE_BINS, (bin) => 0.5 + Arr.filter(ages, (age) => age === bin).length),
  );
}

export const combine = (left: Distribution, right: Distribution): Distribution =>
  normalize(Arr.zipWith(left, right, (mine, theirs) => mine * theirs));

export const logScore = (forecast: Distribution, bin: number): number =>
  Math.log(forecast[bin] ?? Number.MIN_VALUE);

export const brierScore = (forecast: Distribution, bin: number): number =>
  sum(Arr.map(forecast, (probability, index) => (probability - (index === bin ? 1 : 0)) ** 2));

export function inTopYears(forecast: Distribution, bin: number, count: number): boolean {
  const mine = forecast[bin] ?? 0;
  const better = Arr.filter(
    forecast,
    (probability, index) => probability > mine || (probability === mine && index < bin),
  );
  return better.length < count;
}

export interface Interval {
  readonly mean: number;
  readonly low: number;
  readonly high: number;
}

const BOOTSTRAP_SAMPLES = 2000;

const meanOf = (valuesByPerson: ReadonlyArray<ReadonlyArray<number>>): number => {
  const values = Arr.flatten(valuesByPerson);
  return values.length === 0 ? 0 : sum(values) / values.length;
};

export const bootstrapMean = Effect.fn("Eval.bootstrapMean")(function* (
  valuesByPerson: ReadonlyArray<ReadonlyArray<number>>,
) {
  const filled = Arr.filter(valuesByPerson, (group) => group.length > 0);
  const resample = Effect.forEach(filled, () =>
    Effect.map(Random.next, (draw) => filled[Math.floor(draw * filled.length)] ?? []),
  );
  const means = yield* Effect.forEach(
    Arr.makeBy(BOOTSTRAP_SAMPLES, () => resample),
    (sample) => Effect.map(sample, meanOf),
  );
  const sorted = Arr.sort(means, Order.Number);
  return {
    mean: meanOf(filled),
    low: sorted[Math.floor(BOOTSTRAP_SAMPLES * 0.025)] ?? 0,
    high: sorted[Math.floor(BOOTSTRAP_SAMPLES * 0.975)] ?? 0,
  } satisfies Interval;
});
