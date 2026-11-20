import { describe, expect, it } from "@effect/vitest";
import { Array as Arr, Effect, Option, Order, pipe, Random } from "effect";

import {
  evaluateChoices,
  margin,
  supportIn,
  supportOf,
  topChoiceCredit,
  type ChoiceSet,
} from "../../eval/choices.ts";
import { EvalLayer } from "../../eval/evaluate.ts";
import { nullPersons } from "../../eval/synthetic.ts";
import { decodeMoment } from "../../skills/ascendant/tools/common.ts";
import { findKpEvent } from "../../skills/ascendant/tools/events.ts";
import { kpChartAt } from "../../skills/ascendant/tools/judge.ts";
import type { PromiseJudgment } from "../../skills/ascendant/tools/kp-judge.ts";

const OPTIONS = [
  "computer-programmer-h3",
  "teaching-as-profession-h4",
  "sports-fine-arts-film-speculation-as-profession",
  "medical-practitioner-h6",
  "surgeons",
  "politics-as-profession-h9",
] as const;

describe("choice scoring", () => {
  it("orders verdicts from denied to promised", () => {
    const verdict = (fields: object) => supportOf(fields as PromiseJudgment);
    expect([
      verdict({ verdict: "denied" }),
      verdict({ verdict: "mixed", lean: "unfavourable" }),
      verdict({ verdict: "mixed", lean: "balanced" }),
      verdict({ verdict: "not-indicated" }),
      verdict({ verdict: "mixed", lean: "favourable" }),
      verdict({ verdict: "promised" }),
    ]).toEqual([0, 0.25, 0.5, 0.5, 0.75, 1]);
  });

  it("gives full credit for a clear top choice and shares it on a tie", () => {
    expect(topChoiceCredit({ chosen: [1], others: [0.5, 0] })).toBe(1);
    expect(topChoiceCredit({ chosen: [0.5], others: [1, 0] })).toBe(0);
    expect(topChoiceCredit({ chosen: [1], others: [1, 1, 0] })).toBeCloseTo(1 / 3);
    expect(topChoiceCredit({ chosen: [1, 0], others: [1, 0.5] })).toBe(0.5);
  });

  it("measures the margin between chosen and other options", () => {
    expect(margin({ chosen: [1, 0.5], others: [0.25, 0.25] })).toBe(0.5);
  });
});

describe("choice evaluation", () => {
  const events = Arr.getSomes(Arr.map(OPTIONS, findKpEvent));
  const people = nullPersons(12).pipe(Random.withSeed("choices"));

  const answersBy = (pick: (supports: ReadonlyArray<number>, index: number) => number) =>
    Effect.gen(function* () {
      const persons = yield* people;
      const answers = yield* Effect.forEach(persons, (person, index) =>
        Effect.gen(function* () {
          const { facts } = yield* kpChartAt(person, yield* decodeMoment(person.birth));
          const supports = Arr.map(events, (event) => supportIn(facts, event, "as-judged"));
          return { id: person.id, chosen: [OPTIONS[pick(supports, index)] ?? OPTIONS[0]] };
        }),
      );
      const choices: ChoiceSet = { question: "made up", options: OPTIONS, answers };
      return yield* evaluateChoices(persons, choices, 1);
    }).pipe(Effect.provide(EvalLayer));

  const bestSupported = (supports: ReadonlyArray<number>): number =>
    pipe(
      Arr.map(supports, (support, index) => [support, index] as const),
      Arr.sortBy(Order.mapInput(Order.flip(Order.Number), ([support]) => support)),
      Arr.head,
      Option.match({ onNone: () => 0, onSome: ([, index]) => index }),
    );

  it.effect("finds a signal when the chosen option is the one the chart supports most", () =>
    Effect.map(answersBy(bestSupported), (report) => {
      const [asJudged] = report.variants;
      expect(report.people).toBe(12);
      expect(asJudged?.topChoice.ownChart).toBeGreaterThan(asJudged?.topChoice.otherCharts ?? 1);
      expect(asJudged?.topChoice.low).toBeGreaterThan(0);
      expect(asJudged?.topChoice.shareOfReassignmentsAtLeastAsGood).toBeLessThan(0.05);
    }),
  );

  it.effect("finds none when choices ignore the chart, and repeats under one seed", () =>
    Effect.gen(function* () {
      const byTurn = (_: ReadonlyArray<number>, index: number) => index % OPTIONS.length;
      const report = yield* answersBy(byTurn);
      const [asJudged] = report.variants;
      expect(asJudged?.topChoice.low).toBeLessThanOrEqual(0);
      expect(asJudged?.topChoice.high).toBeGreaterThanOrEqual(0);
      expect(yield* answersBy(byTurn)).toEqual(report);
    }),
  );

  it.effect("refuses a choice set with no usable answers", () =>
    Effect.gen(function* () {
      const persons = yield* people;
      const exit = yield* Effect.exit(
        evaluateChoices(persons, { question: "x", options: OPTIONS, answers: [] }, 1).pipe(
          Effect.provide(EvalLayer),
        ),
      );
      expect(exit._tag).toBe("Failure");
    }),
  );
});
