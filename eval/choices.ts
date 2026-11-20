import { Array as Arr, DateTime, Effect, Option, Random, Schema } from "effect";

import { decodeMoment } from "../skills/ascendant/tools/common.ts";
import { findKpEvent, KpEventId, type KpEvent } from "../skills/ascendant/tools/events.ts";
import { kpChartAt } from "../skills/ascendant/tools/judge.ts";
import {
  houseGroup,
  judgePromise,
  KP_JUDGE_VERSION,
  type KpFacts,
  type PromiseJudgment,
} from "../skills/ascendant/tools/kp-judge.ts";
import type { EvalPerson } from "./dataset.ts";
import { bootstrapMean } from "./forecast.ts";

export const ChoiceSet = Schema.Struct({
  question: Schema.String,
  options: Schema.Array(KpEventId),
  answers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      chosen: Schema.Array(KpEventId),
      unsure: Schema.optional(Schema.Array(KpEventId)),
    }),
  ),
});
export interface ChoiceSet extends Schema.Schema.Type<typeof ChoiceSet> {}

export class ChoiceSetUnusable extends Schema.TaggedError<ChoiceSetUnusable>()(
  "ChoiceSetUnusable",
  { message: Schema.String },
) {}

export const HOUSE_SETS = ["as-judged", "with-parenthesised-houses"] as const;
export type HouseSet = (typeof HOUSE_SETS)[number];

const PERMUTATIONS = 5000;

export const supportOf = (promise: PromiseJudgment): number =>
  promise.verdict === "promised"
    ? 1
    : promise.verdict === "denied"
      ? 0
      : promise.verdict === "not-indicated"
        ? 0.5
        : promise.lean === "favourable"
          ? 0.75
          : promise.lean === "unfavourable"
            ? 0.25
            : 0.5;

const eventFor = (event: KpEvent, houses: HouseSet): KpEvent =>
  houses === "as-judged"
    ? event
    : { ...event, supporting: [...event.supporting, ...event.parenthesised], parenthesised: [] };

export const supportIn = (facts: KpFacts, event: KpEvent, houses: HouseSet): number => {
  const judged = eventFor(event, houses);
  return supportOf(judgePromise(facts, judged, houseGroup(judged)));
};

export interface Options {
  readonly chosen: ReadonlyArray<number>;
  readonly others: ReadonlyArray<number>;
}

const mean = (values: ReadonlyArray<number>): number =>
  values.length === 0 ? 0 : Arr.reduce(values, 0, (sum, value) => sum + value) / values.length;

export const topChoiceCredit = ({ chosen, others }: Options): number => {
  const best = Math.max(...chosen, ...others);
  const tiedChosen = Arr.filter(chosen, (support) => support === best).length;
  const tiedOthers = Arr.filter(others, (support) => support === best).length;
  return tiedChosen / (tiedChosen + tiedOthers);
};

export const margin = ({ chosen, others }: Options): number => mean(chosen) - mean(others);

const round = (value: number): number => Math.round(value * 10000) / 10000;

interface Subject {
  readonly id: string;
  readonly chartIndex: number;
  readonly chosen: ReadonlyArray<KpEvent>;
  readonly others: ReadonlyArray<KpEvent>;
}

export const evaluateChoices = Effect.fn("Eval.evaluateChoices")(function* (
  persons: ReadonlyArray<EvalPerson>,
  choices: ChoiceSet,
  seed: number,
) {
  const charts = yield* Effect.forEach(persons, (person) =>
    Effect.gen(function* () {
      const birth = yield* decodeMoment(person.birth);
      return (yield* kpChartAt(person, birth)).facts;
    }),
  );
  const eventsOf = (ids: ReadonlyArray<string>): ReadonlyArray<KpEvent> =>
    Arr.getSomes(Arr.map(ids, findKpEvent));
  const subjects = Arr.getSomes(
    Arr.map(choices.answers, (answer): Option.Option<Subject> => {
      const chartIndex = persons.findIndex((person) => person.id === answer.id);
      const set = Arr.difference(choices.options, answer.unsure ?? []);
      const chosen = eventsOf(Arr.intersection(set, answer.chosen));
      const others = eventsOf(Arr.difference(set, answer.chosen));
      return chartIndex >= 0 && chosen.length > 0 && others.length > 0
        ? Option.some({ id: answer.id, chartIndex, chosen, others })
        : Option.none();
    }),
  );
  if (subjects.length < 2 || charts.length < 2) {
    return yield* new ChoiceSetUnusable({
      message: "Needs at least two answered people whose ids are in the dataset",
    });
  }

  const optionsOn = (subject: Subject, facts: KpFacts, houses: HouseSet): Options => ({
    chosen: Arr.map(subject.chosen, (event) => supportIn(facts, event, houses)),
    others: Arr.map(subject.others, (event) => supportIn(facts, event, houses)),
  });

  const variant = (houses: HouseSet) =>
    Effect.gen(function* () {
      const creditOn = Arr.map(subjects, (subject) =>
        Arr.map(charts, (facts) => topChoiceCredit(optionsOn(subject, facts, houses))),
      );
      const marginOn = Arr.map(subjects, (subject) =>
        Arr.map(charts, (facts) => margin(optionsOn(subject, facts, houses))),
      );
      const own = (table: ReadonlyArray<ReadonlyArray<number>>): ReadonlyArray<number> =>
        Arr.map(subjects, (subject, row) => table[row]?.[subject.chartIndex] ?? 0);
      const onOthers = (table: ReadonlyArray<ReadonlyArray<number>>): ReadonlyArray<number> =>
        Arr.map(subjects, (subject, row) =>
          mean(Arr.filter(table[row] ?? [], (_, column) => column !== subject.chartIndex)),
        );
      const ownCredit = own(creditOn);
      const otherCredit = onOthers(creditOn);
      const ownMargin = own(marginOn);
      const otherMargin = onOthers(marginOn);

      const observed = mean(ownCredit);
      const chartIndexes = Arr.map(subjects, (subject) => subject.chartIndex);
      const reassigned = yield* Effect.forEach(
        Arr.makeBy(PERMUTATIONS, () => Random.shuffle(chartIndexes)),
        (shuffle) =>
          Effect.map(shuffle, (assigned) =>
            mean(Arr.map(assigned, (column, row) => creditOn[row]?.[column] ?? 0)),
          ),
      );
      const creditGain = yield* bootstrapMean(
        Arr.map(ownCredit, (credit, row) => [credit - (otherCredit[row] ?? 0)]),
      );
      const marginGain = yield* bootstrapMean(
        Arr.map(ownMargin, (value, row) => [value - (otherMargin[row] ?? 0)]),
      );

      return {
        houses,
        topChoice: {
          ownChart: round(observed),
          otherCharts: round(mean(otherCredit)),
          gain: round(creditGain.mean),
          low: round(creditGain.low),
          high: round(creditGain.high),
          shareOfReassignmentsAtLeastAsGood: round(
            Arr.filter(reassigned, (value) => value >= observed).length / PERMUTATIONS,
          ),
        },
        margin: {
          ownChart: round(mean(ownMargin)),
          otherCharts: round(mean(otherMargin)),
          gain: round(marginGain.mean),
          low: round(marginGain.low),
          high: round(marginGain.high),
        },
        people: Arr.map(subjects, (subject, row) => {
          const facts = charts[subject.chartIndex];
          const support = (event: KpEvent) =>
            `${event.id}=${facts === undefined ? "?" : supportIn(facts, event, houses)}`;
          return {
            id: subject.id,
            chosen: Arr.map(subject.chosen, support).join(" "),
            others: Arr.map(subject.others, support).join(" "),
            credit: round(ownCredit[row] ?? 0),
            creditOnOtherCharts: round(otherCredit[row] ?? 0),
          };
        }),
      };
    });

  const variants = yield* Effect.forEach(HOUSE_SETS, variant).pipe(Random.withSeed(String(seed)));
  return {
    engine: KP_JUDGE_VERSION,
    question: choices.question,
    people: subjects.length,
    charts: charts.length,
    options: choices.options,
    variants,
  };
});

export type ChoiceReport = Effect.Success<ReturnType<typeof evaluateChoices>>;

export const describeBirth = (person: EvalPerson): string =>
  Option.match(DateTime.make(person.birth), {
    onNone: () => person.id,
    onSome: (birth) => `${person.id} ${DateTime.formatIso(birth)}`,
  });
