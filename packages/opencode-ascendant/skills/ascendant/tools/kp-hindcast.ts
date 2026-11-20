import { Array as Arr, DateTime, Option, pipe, Schema } from "effect";

import type { KpEvent } from "./events.ts";
import {
  BIRTH_TIME_NOT_VERIFIED,
  ENGINE_CHOICES,
  houseGroup,
  judgePromise,
  Planet,
  rankSignificators,
  Verdict,
  VERDICT_ALLOWS_EVENT,
  type Confidence,
  type KpFacts,
  type KpPeriod,
} from "./kp-judge.ts";

export interface PastEvent {
  readonly date: string;
  readonly noonUtc: DateTime.Utc;
  readonly event: KpEvent;
}

export interface LifeSpan {
  readonly from: DateTime.Utc;
  readonly to: DateTime.Utc;
}

export const Fit = Schema.Struct({
  date: Schema.String,
  event: Schema.String,
  verdict: Verdict,
  inConjoinedPeriod: Schema.Boolean,
  lords: Schema.Array(Planet),
  conjoinedShareOfLife: Schema.Finite,
});
export interface Fit extends Schema.Schema.Type<typeof Fit> {}

const toThreeDecimals = (value: number): number => Math.round(value * 1000) / 1000;

export const isConjoinedFor = (facts: KpFacts, event: KpEvent) => {
  const significators = Arr.map(
    rankSignificators(facts, houseGroup(event), Option.none()),
    (entry) => entry.planet,
  );
  return (period: KpPeriod): boolean =>
    Arr.every([period.dasha, period.bhukti, period.antara], (lord) =>
      Arr.contains(significators, lord),
    );
};

export const conjoinedPeriods = (
  facts: KpFacts,
  periods: ReadonlyArray<KpPeriod>,
  event: KpEvent,
): ReadonlyArray<KpPeriod> => Arr.filter(periods, isConjoinedFor(facts, event));

const millisInside = (period: KpPeriod, span: LifeSpan): number =>
  Math.max(
    0,
    DateTime.toEpochMillis(DateTime.min(period.end, span.to)) -
      DateTime.toEpochMillis(DateTime.max(period.start, span.from)),
  );

export function fitPastEvent(
  facts: KpFacts,
  periods: ReadonlyArray<KpPeriod>,
  past: PastEvent,
  span: LifeSpan,
): Fit {
  const isConjoined = isConjoinedFor(facts, past.event);
  const running = Arr.findFirst(
    periods,
    (period) =>
      DateTime.isLessThanOrEqualTo(period.start, past.noonUtc) &&
      DateTime.isLessThan(past.noonUtc, period.end),
  );
  const conjoinedMillis = pipe(
    periods,
    Arr.filter(isConjoined),
    Arr.reduce(0, (sum, period) => sum + millisInside(period, span)),
  );
  const spanMillis = DateTime.toEpochMillis(span.to) - DateTime.toEpochMillis(span.from);
  return {
    date: past.date,
    event: past.event.id,
    verdict: judgePromise(facts, past.event, houseGroup(past.event)).verdict,
    inConjoinedPeriod: Option.exists(running, isConjoined),
    lords: Option.match(running, {
      onNone: () => [],
      onSome: (period) => [period.dasha, period.bhukti, period.antara],
    }),
    conjoinedShareOfLife: spanMillis > 0 ? toThreeDecimals(conjoinedMillis / spanMillis) : 0,
  };
}

const POINT_FOR_CONJOINED_PERIOD = 1;

export const scoreFit = (fit: Fit): number =>
  VERDICT_ALLOWS_EVENT[fit.verdict] + (fit.inConjoinedPeriod ? POINT_FOR_CONJOINED_PERIOD : 0);

export const MIN_PAST_EVENTS = 3;

export interface Trial {
  readonly offsetMinutes: number;
  readonly score: number;
}

const RECORDED_BIRTH_TIME_OFFSET = 0;

export const BirthTimeStatus = Schema.Literals([
  "consistent",
  "suspect",
  "uninformative",
  "unverified",
]);
export type BirthTimeStatus = typeof BirthTimeStatus.Type;

export const BirthTime = Schema.Struct({
  status: BirthTimeStatus,
  pastEvents: Schema.Int,
  windowMinutes: Schema.Finite,
  recordedScore: Schema.OptionFromOptionalKey(Schema.Finite),
  bestScore: Schema.OptionFromOptionalKey(Schema.Finite),
  bestOffsets: Schema.OptionFromOptionalKey(Schema.Array(Schema.Finite)),
  provisionalOffsetMinutes: Schema.OptionFromOptionalKey(Schema.Finite),
  detail: Schema.String,
});
export interface BirthTime extends Schema.Schema.Type<typeof BirthTime> {}

export function checkBirthTime(
  trials: ReadonlyArray<Trial>,
  pastEvents: number,
  windowMinutes: number,
): BirthTime {
  const unverified = (detail: string): BirthTime => ({
    status: "unverified",
    pastEvents,
    windowMinutes,
    recordedScore: Option.none(),
    bestScore: Option.none(),
    bestOffsets: Option.none(),
    provisionalOffsetMinutes: Option.none(),
    detail,
  });
  if (pastEvents < MIN_PAST_EVENTS) {
    return unverified(ENGINE_CHOICES["three-past-events-minimum"]);
  }
  return pipe(
    Arr.findFirst(trials, (trial) => trial.offsetMinutes === RECORDED_BIRTH_TIME_OFFSET),
    Option.filter(() => windowMinutes > 0),
    Option.match({
      onNone: () => unverified("Birth-time check switched off"),
      onSome: (recorded): BirthTime => {
        const scores = Arr.map(trials, (trial) => trial.score);
        const bestScore = Math.max(...scores);
        const bestOffsets = pipe(
          trials,
          Arr.filter((trial) => trial.score === bestScore),
          Arr.map((trial) => trial.offsetMinutes),
        );
        const everyTrialScoresTheSame = bestScore === Math.min(...scores);
        const recordedAmongBest = recorded.score === bestScore;
        const uniqueBetterOffset = pipe(
          Arr.head(bestOffsets),
          Option.filter(() => bestOffsets.length === 1 && !recordedAmongBest),
        );
        const [status, detail]: readonly [BirthTimeStatus, string] = everyTrialScoresTheSame
          ? ["uninformative", ENGINE_CHOICES["flat-scores-uninformative"]]
          : recordedAmongBest
            ? ["consistent", ENGINE_CHOICES["ties-favour-recorded"]]
            : [
                "suspect",
                Option.match(uniqueBetterOffset, {
                  onNone: () =>
                    "Several trial moments fit the past events better than the recorded one",
                  onSome: (offset) =>
                    `Past events fit best ${offset} minutes from the recorded time`,
                }),
              ];
        return {
          status,
          pastEvents,
          windowMinutes,
          recordedScore: Option.some(recorded.score),
          bestScore: Option.some(bestScore),
          bestOffsets: Option.some(bestOffsets),
          provisionalOffsetMinutes: uniqueBetterOffset,
          detail,
        };
      },
    }),
  );
}

const WEAK_EVIDENCE_SHARE_OF_LIFE = 0.8;

const when = <A>(holds: boolean, value: () => A): Option.Option<A> =>
  holds ? Option.some(value()) : Option.none();

export function confidenceWithMemory(
  confidence: Confidence,
  birthTime: BirthTime,
  fits: ReadonlyArray<Fit>,
): Confidence {
  const denied = Arr.filter(fits, (fit) => VERDICT_ALLOWS_EVENT[fit.verdict] === 0).length;
  const outsideConjoined = Arr.filter(fits, (fit) => !fit.inConjoinedPeriod).length;
  const doubts = Arr.getSomes([
    when(denied > 0, () => `The promise rule does not allow ${denied} past events that did happen`),
    when(
      outsideConjoined > 0,
      () => `${outsideConjoined} past events fell outside a conjoined period of significators`,
    ),
  ]);
  return {
    level:
      confidence.level === "low" || birthTime.status === "suspect" || doubts.length > 0
        ? "low"
        : confidence.level,
    calibrated: false,
    basis: [
      birthTime.status === "consistent"
        ? `Birth time consistent with ${birthTime.pastEvents} past events within ${birthTime.windowMinutes} minutes`
        : `${BIRTH_TIME_NOT_VERIFIED}: ${birthTime.detail}`,
      ...Arr.filter(confidence.basis, (reason) => reason !== BIRTH_TIME_NOT_VERIFIED),
      ...doubts,
      ...Arr.getSomes([
        when(
          fits.length > 0 &&
            Arr.every(fits, (fit) => fit.conjoinedShareOfLife >= WEAK_EVIDENCE_SHARE_OF_LIFE),
          () => ENGINE_CHOICES["high-coverage-weak-evidence"],
        ),
      ]),
    ],
  };
}
