import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, DateTime, Effect, Option, Random } from "effect";

import { AGE_BINS, parseDataset, type EvalPerson } from "../../eval/dataset.ts";
import { DEFAULT_OPTIONS, evaluate, EvalLayer, renderReport } from "../../eval/evaluate.ts";
import {
  baseRate,
  bootstrapMean,
  brierScore,
  combine,
  engineForecast,
  inTopYears,
  logScore,
  uniform,
} from "../../eval/forecast.ts";
import { dateOf, nullPersons, toJsonl } from "../../eval/synthetic.ts";
import { decodeMoment } from "../../skills/ascendant/tools/common.ts";
import { findKpEvent } from "../../skills/ascendant/tools/events.ts";
import { kpChartAt, skyBetween } from "../../skills/ascendant/tools/judge.ts";
import {
  houseGroup,
  rankSignificators,
  timingPlanets,
  transitAgreements,
} from "../../skills/ascendant/tools/kp-judge.ts";

const sum = (values: ReadonlyArray<number>): number =>
  values.reduce((total, value) => total + value, 0);

describe("dataset", () => {
  const person = (events: unknown) =>
    JSON.stringify({
      id: "p1",
      birth: "1990-01-01T12:00:00+05:30",
      latitude: 12.9716,
      longitude: 77.5946,
      events,
    });

  it("reads people and turns each event into a case with its age", () => {
    const dataset = parseDataset(
      `${person([{ event: "marriage", date: "2019-02-20" }])}\n\n${person([])}\n`,
    );
    expect(dataset.persons).toHaveLength(2);
    expect(dataset.problems).toEqual([]);
    expect(dataset.cases).toHaveLength(1);
    expect(dataset.cases[0]).toMatchObject({ personIndex: 0, ageYears: 29 });
    expect(dataset.cases[0]?.event.id).toBe("marriage");
  });

  it("drops what it cannot use and says why", () => {
    const dataset = parseDataset(
      [
        "not json",
        person([{ event: "accident", date: "2019-02-20" }]),
        person([
          { event: "marriage", date: "1985-01-01" },
          { event: "marriage", date: "2075-01-01" },
        ]),
      ].join("\n"),
    );
    expect(dataset.persons).toHaveLength(1);
    expect(dataset.cases).toEqual([]);
    expect(dataset.problems).toHaveLength(4);
    expect(dataset.problems[0]).toBe("line 1: not JSON");
    expect(dataset.problems[1]).toMatch(/^line 2:/);
    expect(dataset.problems[2]).toContain("age -5");
    expect(dataset.problems[3]).toContain("age 84");
  });
});

describe("forecasts and scores", () => {
  const oneYearOnly = (ageYears: number) =>
    Arr.makeBy(AGE_BINS, (age) => (age === ageYears ? 1 : 0));

  it("every forecast is a probability for each year, summing to 1", () => {
    const usual = baseRate([], "marriage", 0);
    [uniform(), engineForecast(oneYearOnly(30)), usual, combine(uniform(), usual)].forEach(
      (forecast) => {
        expect(forecast).toHaveLength(AGE_BINS);
        expect(sum(forecast)).toBeCloseTo(1, 10);
        expect(Math.min(...forecast)).toBeGreaterThan(0);
      },
    );
  });

  it("a forecast that puts the event's year first scores best", () => {
    const sharp = engineForecast(oneYearOnly(30));
    expect(logScore(sharp, 30)).toBeGreaterThan(logScore(uniform(), 30));
    expect(logScore(sharp, 31)).toBeLessThan(logScore(uniform(), 31));
    expect(brierScore(sharp, 30)).toBeLessThan(brierScore(uniform(), 30));
    expect(inTopYears(sharp, 30, 1)).toBe(true);
    expect(inTopYears(sharp, 31, 1)).toBe(false);
  });

  it("the base rate leaves the scored person out", () => {
    const marriage = Option.getOrThrow(findKpEvent("marriage"));
    const noonUtc = DateTime.makeUnsafe(0);
    const forPersonZero = baseRate(
      [
        { personIndex: 0, event: marriage, noonUtc, ageYears: 28 },
        { personIndex: 1, event: marriage, noonUtc, ageYears: 40 },
      ],
      "marriage",
      0,
    );
    expect(forPersonZero[40]).toBeGreaterThan(forPersonZero[28] ?? 0);
  });

  it.effect("resampling is reproducible under a seed and brackets the mean", () =>
    Effect.gen(function* () {
      const draw = bootstrapMean([[1, 2], [3], [], [0, 0, 4]]).pipe(Random.withSeed("7"));
      const first = yield* draw;
      expect(yield* draw).toEqual(first);
      expect(first.mean).toBeCloseTo(10 / 6, 10);
      expect(first.low).toBeLessThanOrEqual(first.mean);
      expect(first.high).toBeGreaterThanOrEqual(first.mean);
    }),
  );
});

const people = (count: number, seed: string) => nullPersons(count).pipe(Random.withSeed(seed));

const evaluatePeople = (
  persons: ReadonlyArray<EvalPerson>,
  skyStepDays = DEFAULT_OPTIONS.skyStepDays,
) => evaluate(parseDataset(toJsonl(persons)), { ...DEFAULT_OPTIONS, skyStepDays });

describe("evaluation", () => {
  it.effect("the same seed makes the same people", () =>
    Effect.gen(function* () {
      expect(toJsonl(yield* people(5, "a"))).toBe(toJsonl(yield* people(5, "a")));
      expect(toJsonl(yield* people(5, "a"))).not.toBe(toJsonl(yield* people(5, "b")));
    }),
  );

  it.effect("events that ignore the chart: no chart signal, same report every run", () =>
    Effect.gen(function* () {
      const persons = yield* people(40, "b");
      const first = yield* evaluatePeople(persons, 5);
      expect(JSON.stringify(yield* evaluatePeople(persons, 5))).toBe(JSON.stringify(first));

      expect(first.dataset.persons).toBe(40);
      expect(first.comparisons[0]).toMatchObject({
        name: "engine vs shuffled chart",
        result: "no measurable difference",
      });
      expect(first.conclusion).toMatch(/^No evidence/);
      expect(renderReport(first, "null")).toContain("| engine vs shuffled chart |");
    }).pipe(Effect.provide(EvalLayer)),
  );

  it.effect(
    "events planted on each person's own transit-agreement days: the harness finds the signal",
    () =>
      Effect.gen(function* () {
        const planted = yield* Effect.forEach(yield* people(25, "planted"), (person) =>
          Effect.gen(function* () {
            const birth = yield* decodeMoment(person.birth);
            const chart = yield* kpChartAt(person, birth);
            const sky = yield* skyBetween(
              DateTime.add(birth, { years: 15 }),
              DateTime.add(birth, { years: 60 }),
              7,
            );
            const events = yield* Effect.forEach(person.events, (entry) =>
              Effect.gen(function* () {
                const event = Option.getOrThrow(findKpEvent(entry.event));
                const agreeing = transitAgreements(
                  timingPlanets(rankSignificators(chart.facts, houseGroup(event), Option.none())),
                  chart.periods,
                  sky,
                );
                const pick = Arr.get(agreeing, Math.floor((yield* Random.next) * agreeing.length));
                return Option.match(pick, {
                  onNone: () => [],
                  onSome: ({ sample }) => [
                    { event: entry.event, date: dateOf(DateTime.toEpochMillis(sample.at)) },
                  ],
                });
              }),
            );
            return { ...person, events: Arr.flatten(events) };
          }),
        ).pipe(Random.withSeed("plant"));

        const report = yield* evaluatePeople(planted);
        expect(report.comparisons[0]).toMatchObject({
          name: "engine vs shuffled chart",
          result: "better",
        });
        expect(report.periodHits.own.rate).toBeGreaterThan(report.periodHits.shuffledChart.rate);
        expect(report.conclusion).not.toMatch(/^No evidence/);
      }).pipe(Effect.provide(EvalLayer)),
  );

  it.effect("a dataset too small to compare is refused", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(evaluatePeople(yield* people(1, "one")));
      expect(failure._tag).toBe("DatasetTooSmall");
    }).pipe(Effect.provide(EvalLayer)),
  );
});
