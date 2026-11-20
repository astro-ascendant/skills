import { Chart } from "astro-ascendant";
import { Array as Arr, DateTime, Option, Order, pipe, Schema } from "effect";

import { House, isOnceOnly, type KpEvent } from "./events.ts";

export const KP_JUDGE_VERSION = "kp-judge/4";

export const Planet = Chart.Planets;
export type Planet = typeof Planet.Type;

export const KP_PLANETS: ReadonlyArray<Planet> = Planet.literals;
export const KP_HOUSES: ReadonlyArray<House> = House.literals;

export const EngineChoice = Schema.Literals([
  "conducive-outranks-twelfth",
  "own-star-is-tenant",
  "neither-group-not-indicated",
  "detrimental-house-at-stronger-level",
  "detrimental-sub-only-detrimental",
  "weakened-ranked-last",
  "periods-by-rank-sum-then-start",
  "confidence-capped-at-moderate",
  "once-only-not-retimed",
  "parenthesised-not-counted",
  "mixed-allows-event",
  "fit-score-promise-plus-period",
  "three-past-events-minimum",
  "flat-scores-uninformative",
  "ties-favour-recorded",
  "provisional-only-if-unique",
  "high-coverage-weak-evidence",
  "transit-in-significator-star",
  "transit-sampled-at-fixed-step",
]);
export type EngineChoice = typeof EngineChoice.Type;

export const ENGINE_CHOICES = {
  "conducive-outranks-twelfth":
    "A house that is conducive and also 12th from another conducive house counts as conducive",
  "own-star-is-tenant":
    "A planet in its own star counts as a tenant of that star, so it is not self-strength",
  "neither-group-not-indicated":
    "A sub lord signifying neither a conducive nor a detrimental house gives not-indicated, not a denial",
  "detrimental-house-at-stronger-level":
    "A significator is weakened only when it signifies a detrimental house at a stronger level than any conducive house",
  "detrimental-sub-only-detrimental":
    "A significator is weakened when its sub lord signifies a detrimental house and no conducive house",
  "weakened-ranked-last": "Weakened significators are ranked last, not removed",
  "periods-by-rank-sum-then-start":
    "Conjoined periods are ordered by the summed ranks of their three lords, then by start",
  "confidence-capped-at-moderate":
    "Confidence is moderate at most while the rules are not calibrated against outcomes",
  "once-only-not-retimed":
    "An event that happens once in a life gets no window after memory records it",
  "parenthesised-not-counted":
    "Houses the guidebook puts in parentheses are reported and counted neither for nor against",
  "mixed-allows-event": "A mixed promise counts as allowing an event that did happen",
  "fit-score-promise-plus-period":
    "A past event scores one point when the promise allows it and one when its period is conjoined",
  "three-past-events-minimum": "The birth time is checked only with three or more past events",
  "flat-scores-uninformative":
    "When every trial moment scores the same, past events say nothing about the birth time",
  "ties-favour-recorded":
    "The recorded birth time is consistent when no trial moment scores higher",
  "provisional-only-if-unique":
    "A provisional birth time is offered only when one trial moment alone scores best",
  "high-coverage-weak-evidence":
    "Past events inside conjoined periods are weak evidence when such periods cover most of the life",
  "transit-in-significator-star":
    "A period lord transits a significator when it is in a star whose lord is a significator; the sub is not checked",
  "transit-sampled-at-fixed-step":
    "Transits are read at a fixed step, so a window's edges are accurate to one step",
} as const satisfies Record<EngineChoice, string>;

export const GuidebookFile = Schema.Literals([
  "kp/fundamental-principles.md",
  "kp/house-grouping.md",
]);
export type GuidebookFile = typeof GuidebookFile.Type;

export const Provenance = Schema.Union([
  Schema.TaggedStruct("Guidebook", { file: GuidebookFile, section: Schema.String }),
  Schema.TaggedStruct("Engine", { choice: EngineChoice }),
]);
export type Provenance = typeof Provenance.Type;

const principles = (section: string): Provenance => ({
  _tag: "Guidebook",
  file: "kp/fundamental-principles.md",
  section,
});

const houseGrouping = (section: string): Provenance => ({
  _tag: "Guidebook",
  file: "kp/house-grouping.md",
  section,
});

export const engine = (choice: EngineChoice): Provenance => ({ _tag: "Engine", choice });

export const RuleId = Schema.Literals([
  "promise.self-strength-order",
  "promise.conducive-house",
  "promise.detrimental-house",
  "promise.hierarchy",
  "promise.no-rule",
  "timing.conjoined-period",
  "timing.no-conjoined-period",
  "timing.skipped",
  "timing.already-occurred",
  "timing.transit-agreement",
  "timing.no-transit-agreement",
]);
export type RuleId = typeof RuleId.Type;

const RULE_SOURCES: Readonly<Record<RuleId, Provenance>> = {
  "promise.self-strength-order": principles("Strengths of Significators"),
  "promise.conducive-house": principles("Finding out promises in a chart"),
  "promise.detrimental-house": principles("Finding out promises in a chart"),
  "promise.hierarchy": principles("Finding out promises in a chart"),
  "promise.no-rule": engine("neither-group-not-indicated"),
  "timing.conjoined-period": principles("Timing Events"),
  "timing.no-conjoined-period": principles("Timing Events"),
  "timing.skipped": principles("Timing Events"),
  "timing.already-occurred": engine("once-only-not-retimed"),
  "timing.transit-agreement": principles("Timing Events"),
  "timing.no-transit-agreement": principles("Timing Events"),
};

export const Polarity = Schema.Literals(["for", "against", "neutral"]);
export type Polarity = typeof Polarity.Type;

export const RuleFiring = Schema.Struct({
  rule: RuleId,
  source: Provenance,
  polarity: Polarity,
  detail: Schema.String,
});
export interface RuleFiring extends Schema.Schema.Type<typeof RuleFiring> {}

const fire = (rule: RuleId, polarity: Polarity, detail: string): RuleFiring => ({
  rule,
  source: RULE_SOURCES[rule],
  polarity,
  detail,
});

const fireWhen = (
  fires: boolean,
  rule: RuleId,
  polarity: Polarity,
  detail: () => string,
): Option.Option<RuleFiring> =>
  fires ? Option.some(fire(rule, polarity, detail())) : Option.none();

export const Level = Schema.Literals([1, 2, 3, 4]);
export type Level = typeof Level.Type;
const LEVELS: ReadonlyArray<Level> = Level.literals;

export const ReadingOrder = Schema.Literals([1, 2, 3, 4]);
export type ReadingOrder = typeof ReadingOrder.Type;

const NORMAL_READING_ORDER: Readonly<Record<Level, ReadingOrder>> = { 1: 1, 2: 2, 3: 3, 4: 4 };
const SELF_STRENGTH_READING_ORDER: Readonly<Record<Level, ReadingOrder>> = {
  2: 1,
  1: 2,
  4: 3,
  3: 4,
};

const levelsOf = <A extends Schema.Top>(item: A) =>
  Schema.Struct({
    level1: Schema.Array(item),
    level2: Schema.Array(item),
    level3: Schema.Array(item),
    level4: Schema.Array(item),
  });

export interface Levels<A> {
  readonly level1: ReadonlyArray<A>;
  readonly level2: ReadonlyArray<A>;
  readonly level3: ReadonlyArray<A>;
  readonly level4: ReadonlyArray<A>;
}

export const KpFacts = Schema.Struct({
  cuspSubLords: Schema.Record(House, Planet),
  planetStarLords: Schema.Record(Planet, Planet),
  planetSubLords: Schema.Record(Planet, Planet),
  planetSignifications: Schema.Record(Planet, levelsOf(House)),
  houseSignificators: Schema.Record(House, levelsOf(Planet)),
});
export interface KpFacts extends Schema.Schema.Type<typeof KpFacts> {}

export const KpPeriod = Schema.Struct({
  dasha: Planet,
  bhukti: Planet,
  antara: Planet,
  start: Schema.DateTimeUtc,
  end: Schema.DateTimeUtc,
});
export interface KpPeriod extends Schema.Schema.Type<typeof KpPeriod> {}

export interface JudgeOptions {
  readonly from: DateTime.Utc;
  readonly to: DateTime.Utc;
  readonly limit: number;
  readonly rulingPlanets: Option.Option<ReadonlyArray<Planet>>;
  readonly occurred: ReadonlyArray<DateTime.Utc>;
}

export const Role = Schema.Literals(["conducive", "detrimental", "parenthesised", "other"]);
export type Role = typeof Role.Type;

export const HouseGroup = Schema.Struct({
  conducive: Schema.Array(House),
  parenthesised: Schema.Array(House),
  detrimental: Schema.Array(House),
});
export interface HouseGroup extends Schema.Schema.Type<typeof HouseGroup> {}

export const Signification = Schema.Struct({
  house: House,
  level: Level,
  readingOrder: ReadingOrder,
  role: Role,
});
export interface Signification extends Schema.Schema.Type<typeof Signification> {}

const TWELFTH_FROM: Readonly<Record<House, House>> = {
  1: 12,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  10: 9,
  11: 10,
  12: 11,
};

export const twelfthFrom = (house: House): House => TWELFTH_FROM[house];

const inHouseOrder = (houses: ReadonlyArray<House>): ReadonlyArray<House> =>
  pipe(houses, Arr.dedupe, Arr.sort(Order.Number));

const conduciveOutranksTwelfth = (
  twelfthHouses: ReadonlyArray<House>,
  conducive: ReadonlyArray<House>,
): ReadonlyArray<House> => Arr.difference(twelfthHouses, conducive);

export function houseGroup(event: KpEvent): HouseGroup {
  const conducive = inHouseOrder([event.primary, ...event.supporting]);
  return {
    conducive,
    parenthesised: inHouseOrder(Arr.difference(event.parenthesised, conducive)),
    detrimental: inHouseOrder(conduciveOutranksTwelfth(Arr.map(conducive, twelfthFrom), conducive)),
  };
}

const tenantsCountingOwnStar = (facts: KpFacts, planet: Planet): ReadonlyArray<Planet> =>
  Arr.filter(KP_PLANETS, (tenant) => facts.planetStarLords[tenant] === planet);

export const isSelfStrength = (facts: KpFacts, planet: Planet): boolean =>
  tenantsCountingOwnStar(facts, planet).length === 0;

const roleOf = (group: HouseGroup, house: House): Role =>
  Arr.contains(group.conducive, house)
    ? "conducive"
    : Arr.contains(group.detrimental, house)
      ? "detrimental"
      : Arr.contains(group.parenthesised, house)
        ? "parenthesised"
        : "other";

const byReadingOrderThenHouse: Order.Order<Signification> = Order.combine(
  Order.mapInput(Order.Number, (entry: Signification) => entry.readingOrder),
  Order.mapInput(Order.Number, (entry: Signification) => entry.house),
);

export function significationsOf(
  facts: KpFacts,
  planet: Planet,
  group: HouseGroup,
): ReadonlyArray<Signification> {
  const readingOrder = isSelfStrength(facts, planet)
    ? SELF_STRENGTH_READING_ORDER
    : NORMAL_READING_ORDER;
  const levels = facts.planetSignifications[planet];
  return pipe(
    LEVELS,
    Arr.flatMap((level) =>
      Arr.map(levels[`level${level}`], (house): Signification => ({
        house,
        level,
        readingOrder: readingOrder[level],
        role: roleOf(group, house),
      })),
    ),
    Arr.sort(byReadingOrderThenHouse),
    Arr.dedupeWith((first, later) => first.house === later.house),
  );
}

export const Verdict = Schema.Literals(["promised", "mixed", "denied", "not-indicated"]);
export type Verdict = typeof Verdict.Type;

export const Lean = Schema.Literals(["favourable", "balanced", "unfavourable"]);
export type Lean = typeof Lean.Type;

export const VERDICT_ALLOWS_EVENT = {
  promised: 1,
  mixed: 1,
  denied: 0,
  "not-indicated": 0,
} as const satisfies Record<Verdict, 0 | 1>;

const promiseEvidence = {
  cusp: House,
  subLord: Planet,
  selfStrength: Schema.Boolean,
  significations: Schema.Array(Signification),
};
const promiseRules = { rules: Schema.Array(RuleFiring) };

export const PromiseJudgment = Schema.Union([
  Schema.Struct({ ...promiseEvidence, verdict: Schema.Literal("promised"), ...promiseRules }),
  Schema.Struct({
    ...promiseEvidence,
    verdict: Schema.Literal("mixed"),
    lean: Lean,
    ...promiseRules,
  }),
  Schema.Struct({ ...promiseEvidence, verdict: Schema.Literal("denied"), ...promiseRules }),
  Schema.Struct({ ...promiseEvidence, verdict: Schema.Literal("not-indicated"), ...promiseRules }),
]);
export type PromiseJudgment = typeof PromiseJudgment.Type;

const strongest = (
  significations: ReadonlyArray<Signification>,
  role: Role,
): Option.Option<ReadingOrder> =>
  pipe(
    Arr.findFirst(significations, (entry) => entry.role === role),
    Option.map((entry) => entry.readingOrder),
  );

const housesWith = (significations: ReadonlyArray<Signification>, role: Role): string =>
  pipe(
    significations,
    Arr.filter((entry) => entry.role === role),
    Arr.map((entry) => `${entry.house} (level ${entry.level})`),
    Arr.join(", "),
  );

const leanOf = (conducive: ReadingOrder, detrimental: ReadingOrder): Lean =>
  conducive < detrimental ? "favourable" : conducive > detrimental ? "unfavourable" : "balanced";

const LEAN_POLARITY: Readonly<Record<Lean, Polarity>> = {
  favourable: "for",
  balanced: "neutral",
  unfavourable: "against",
};

export function judgePromise(facts: KpFacts, event: KpEvent, group: HouseGroup): PromiseJudgment {
  const subLord = facts.cuspSubLords[event.primary];
  const selfStrength = isSelfStrength(facts, subLord);
  const significations = significationsOf(facts, subLord, group);
  const conducive = strongest(significations, "conducive");
  const detrimental = strongest(significations, "detrimental");
  const mixed = Option.map(Option.all({ conducive, detrimental }), (strongestOf) => ({
    ...strongestOf,
    lean: leanOf(strongestOf.conducive, strongestOf.detrimental),
  }));

  const rules = Arr.getSomes([
    fireWhen(
      selfStrength,
      "promise.self-strength-order",
      "neutral",
      () => `${subLord} has no planet in its stars, so its levels are read in the order 2, 1, 4, 3`,
    ),
    fireWhen(
      Option.isSome(conducive),
      "promise.conducive-house",
      "for",
      () =>
        `Sub lord ${subLord} of cusp ${event.primary} signifies conducive houses ${housesWith(significations, "conducive")}`,
    ),
    fireWhen(
      Option.isSome(detrimental),
      "promise.detrimental-house",
      "against",
      () =>
        `Sub lord ${subLord} of cusp ${event.primary} signifies detrimental houses ${housesWith(significations, "detrimental")}`,
    ),
    fireWhen(
      Option.isNone(conducive) && Option.isNone(detrimental),
      "promise.no-rule",
      "neutral",
      () =>
        `Sub lord ${subLord} signifies neither a conducive nor a detrimental house; the guidebook gives no rule for this case`,
    ),
    Option.map(mixed, (strongestOf) =>
      fire(
        "promise.hierarchy",
        LEAN_POLARITY[strongestOf.lean],
        `Strongest conducive signification is read ${strongestOf.conducive} and strongest detrimental is read ${strongestOf.detrimental} (1 is read first)`,
      ),
    ),
  ]);

  const evidence = { cusp: event.primary, subLord, selfStrength, significations };
  return Option.match(mixed, {
    onSome: ({ lean }): PromiseJudgment => ({ ...evidence, verdict: "mixed", lean, rules }),
    onNone: (): PromiseJudgment =>
      Option.isSome(conducive)
        ? { ...evidence, verdict: "promised", rules }
        : Option.isSome(detrimental)
          ? { ...evidence, verdict: "denied", rules }
          : { ...evidence, verdict: "not-indicated", rules },
  });
}

export const Criterion = Schema.Literals([
  "ruling-planet",
  "in-star-of-cusp-sub-lord",
  "is-cusp-sub-lord",
  "in-sub-of-untenanted-significator",
]);
export type Criterion = typeof Criterion.Type;

export const Weakness = Schema.Literals([
  "detrimental-house-at-stronger-level",
  "detrimental-sub-only-detrimental",
]);
export type Weakness = typeof Weakness.Type;

const SignifiedHouse = Schema.Struct({ house: House, level: Level });
interface SignifiedHouse extends Schema.Schema.Type<typeof SignifiedHouse> {}

export const Significator = Schema.Struct({
  rank: Schema.Int,
  planet: Planet,
  conduciveHouses: Schema.Array(SignifiedHouse),
  detrimentalHouses: Schema.Array(SignifiedHouse),
  criteria: Schema.Array(Criterion),
  weakened: Schema.Array(Weakness),
});
export interface Significator extends Schema.Schema.Type<typeof Significator> {}

type Unranked = Omit<Significator, "rank">;

const housesSignifiedBy = (
  facts: KpFacts,
  planet: Planet,
  houses: ReadonlyArray<House>,
): ReadonlyArray<SignifiedHouse> =>
  Arr.getSomes(
    Arr.map(houses, (house) =>
      pipe(
        Arr.findFirst(LEVELS, (level) =>
          Arr.contains(facts.houseSignificators[house][`level${level}`], planet),
        ),
        Option.map((level): SignifiedHouse => ({ house, level })),
      ),
    ),
  );

const WEAKER_THAN_ANY_LEVEL = Math.max(...LEVELS) + 1;

const strongestLevel = (houses: ReadonlyArray<SignifiedHouse>): number =>
  Arr.reduce(houses, WEAKER_THAN_ANY_LEVEL, (strongestSoFar, entry) =>
    Math.min(strongestSoFar, entry.level),
  );

const detrimentalHouseAtStrongerLevel = (
  conduciveHouses: ReadonlyArray<SignifiedHouse>,
  detrimentalHouses: ReadonlyArray<SignifiedHouse>,
): boolean => strongestLevel(detrimentalHouses) < strongestLevel(conduciveHouses);

const detrimentalSubOnlyDetrimental = (
  subLordConducive: ReadonlyArray<SignifiedHouse>,
  subLordDetrimental: ReadonlyArray<SignifiedHouse>,
): boolean => subLordDetrimental.length > 0 && subLordConducive.length === 0;

const when = <A>(holds: boolean, value: A): Option.Option<A> =>
  holds ? Option.some(value) : Option.none();

const byNumber = (key: (entry: Unranked) => number): Order.Order<Unranked> =>
  Order.mapInput(Order.Number, key);

const lacks = (criterion: Criterion) => (entry: Unranked) =>
  Arr.contains(entry.criteria, criterion) ? 0 : 1;

const weakenedRankedLast = byNumber((entry) => entry.weakened.length);

const guidebookSelectionSteps = Order.combineAll([
  byNumber(lacks("ruling-planet")),
  byNumber(lacks("in-star-of-cusp-sub-lord")),
  byNumber(lacks("is-cusp-sub-lord")),
  byNumber(lacks("in-sub-of-untenanted-significator")),
]);

const moreAndStrongerHousesFirst = Order.combineAll([
  byNumber((entry) => -entry.conduciveHouses.length),
  byNumber((entry) => strongestLevel(entry.conduciveHouses)),
  byNumber((entry) => entry.detrimentalHouses.length),
  byNumber((entry) => KP_PLANETS.indexOf(entry.planet)),
]);

const bySignificatorStrength: Order.Order<Unranked> = Order.combineAll([
  weakenedRankedLast,
  guidebookSelectionSteps,
  moreAndStrongerHousesFirst,
]);

export function rankSignificators(
  facts: KpFacts,
  group: HouseGroup,
  rulingPlanets: Option.Option<ReadonlyArray<Planet>>,
): ReadonlyArray<Significator> {
  const cuspSubLords = Arr.map(group.conducive, (house) => facts.cuspSubLords[house]);
  const conduciveOf = (planet: Planet) => housesSignifiedBy(facts, planet, group.conducive);
  const detrimentalOf = (planet: Planet) => housesSignifiedBy(facts, planet, group.detrimental);
  const significators = Arr.filter(KP_PLANETS, (planet) => conduciveOf(planet).length > 0);

  return pipe(
    significators,
    Arr.map((planet): Unranked => {
      const conduciveHouses = conduciveOf(planet);
      const detrimentalHouses = detrimentalOf(planet);
      const subLord = facts.planetSubLords[planet];
      return {
        planet,
        conduciveHouses,
        detrimentalHouses,
        criteria: Arr.getSomes<ReadonlyArray<Option.Option<Criterion>>>([
          when(Option.exists(rulingPlanets, Arr.contains(planet)), "ruling-planet"),
          when(
            Arr.contains(cuspSubLords, facts.planetStarLords[planet]),
            "in-star-of-cusp-sub-lord",
          ),
          when(Arr.contains(cuspSubLords, planet), "is-cusp-sub-lord"),
          when(
            Arr.contains(significators, subLord) && isSelfStrength(facts, subLord),
            "in-sub-of-untenanted-significator",
          ),
        ]),
        weakened: Arr.getSomes<ReadonlyArray<Option.Option<Weakness>>>([
          when(
            detrimentalHouseAtStrongerLevel(conduciveHouses, detrimentalHouses),
            "detrimental-house-at-stronger-level",
          ),
          when(
            detrimentalSubOnlyDetrimental(conduciveOf(subLord), detrimentalOf(subLord)),
            "detrimental-sub-only-detrimental",
          ),
        ]),
      };
    }),
    Arr.sort(bySignificatorStrength),
    Arr.map((entry, index): Significator => ({ rank: index + 1, ...entry })),
  );
}

export const Window = Schema.Struct({
  rank: Schema.Int,
  dasha: Planet,
  bhukti: Planet,
  antara: Planet,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
});
export interface Window extends Schema.Schema.Type<typeof Window> {}

export const TimingStatus = Schema.Literals([
  "windows",
  "no-conjoined-period",
  "no-transit-agreement",
  "skipped",
  "already-occurred",
]);
export type TimingStatus = typeof TimingStatus.Type;

export const Timing = Schema.Struct({
  status: TimingStatus,
  windows: Schema.Array(Window),
  conjoinedPeriods: Schema.Int,
  foundBeforeLimit: Schema.Int,
  rules: Schema.Array(RuleFiring),
});
export interface Timing extends Schema.Schema.Type<typeof Timing> {}

const untimed = (status: TimingStatus, rule: RuleFiring, conjoinedPeriods = 0): Timing => ({
  status,
  windows: [],
  conjoinedPeriods,
  foundBeforeLimit: 0,
  rules: [rule],
});

export const SkySample = Schema.Struct({
  at: Schema.DateTimeUtc,
  starLords: Schema.Record(Planet, Planet),
});
export interface SkySample extends Schema.Schema.Type<typeof SkySample> {}

export interface Sky {
  readonly stepDays: number;
  readonly samples: ReadonlyArray<SkySample>;
}

const lordsOf = (period: KpPeriod): ReadonlyArray<Planet> => [
  period.dasha,
  period.bhukti,
  period.antara,
];

export const isConjoined = (significators: ReadonlyArray<Planet>, period: KpPeriod): boolean =>
  Arr.every(lordsOf(period), (lord) => Arr.contains(significators, lord));

export const lordsTransitSignificatorStars = (
  significators: ReadonlyArray<Planet>,
  period: KpPeriod,
  sample: SkySample,
): boolean =>
  Arr.every(lordsOf(period), (lord) => Arr.contains(significators, sample.starLords[lord]));

const lastIndexStartingAtOrBefore = (
  startsInOrder: ReadonlyArray<number>,
  moment: number,
  low: number,
  high: number,
): number => {
  if (low >= high) return low;
  const middle = Math.ceil((low + high) / 2);
  return (startsInOrder[middle] ?? Number.POSITIVE_INFINITY) <= moment
    ? lastIndexStartingAtOrBefore(startsInOrder, moment, middle, high)
    : lastIndexStartingAtOrBefore(startsInOrder, moment, low, middle - 1);
};

export interface TransitAgreement {
  readonly sample: SkySample;
  readonly sampleIndex: number;
  readonly period: KpPeriod;
}

export function transitAgreements(
  significators: ReadonlyArray<Planet>,
  periodsInTimeOrder: ReadonlyArray<KpPeriod>,
  sky: Sky,
): ReadonlyArray<TransitAgreement> {
  const starts = Arr.map(periodsInTimeOrder, (period) => DateTime.toEpochMillis(period.start));
  return Arr.getSomes(
    Arr.map(sky.samples, (sample, sampleIndex) =>
      pipe(
        Arr.get(
          periodsInTimeOrder,
          lastIndexStartingAtOrBefore(
            starts,
            DateTime.toEpochMillis(sample.at),
            0,
            starts.length - 1,
          ),
        ),
        Option.filter(
          (period) =>
            DateTime.isLessThanOrEqualTo(period.start, sample.at) &&
            DateTime.isLessThan(sample.at, period.end) &&
            isConjoined(significators, period) &&
            lordsTransitSignificatorStars(significators, period, sample),
        ),
        Option.map((period): TransitAgreement => ({ sample, sampleIndex, period })),
      ),
    ),
  );
}

export const timingPlanets = (significators: ReadonlyArray<Significator>): ReadonlyArray<Planet> =>
  Arr.map(significators, (entry) => entry.planet);

interface AgreementRun {
  readonly period: KpPeriod;
  readonly rankSum: number;
  readonly first: DateTime.Utc;
  readonly last: DateTime.Utc;
  readonly lastSampleIndex: number;
}

const byRankSumThenStart: Order.Order<AgreementRun> = Order.combine(
  Order.mapInput(Order.Number, (run: AgreementRun) => run.rankSum),
  Order.mapInput(DateTime.Order, (run: AgreementRun) => run.first),
);

export function timeEvent(
  significators: ReadonlyArray<Significator>,
  periodsInTimeOrder: ReadonlyArray<KpPeriod>,
  sky: Sky,
  options: Pick<JudgeOptions, "from" | "to" | "limit">,
): Timing {
  const planets = timingPlanets(significators);
  const rankSumOf = (period: KpPeriod): number =>
    Arr.reduce(
      lordsOf(period),
      0,
      (sum, lord) =>
        sum +
        pipe(
          Arr.findFirst(significators, (entry) => entry.planet === lord),
          Option.match({ onNone: () => 0, onSome: (entry) => entry.rank }),
        ),
    );
  const conjoinedPeriods = Arr.filter(
    periodsInTimeOrder,
    (period) =>
      DateTime.isGreaterThan(period.end, options.from) &&
      DateTime.isLessThan(period.start, options.to) &&
      isConjoined(planets, period),
  ).length;

  if (conjoinedPeriods === 0) {
    return untimed(
      "no-conjoined-period",
      fire(
        "timing.no-conjoined-period",
        "against",
        "No dasha, bhukti and antara in the window are all significators of the house group",
      ),
    );
  }

  const samplesInWindow = Arr.filter(
    sky.samples,
    (sample) =>
      DateTime.isGreaterThanOrEqualTo(sample.at, options.from) &&
      DateTime.isLessThan(sample.at, options.to),
  );
  const runs = Arr.reduce(
    transitAgreements(planets, periodsInTimeOrder, { ...sky, samples: samplesInWindow }),
    [] as ReadonlyArray<AgreementRun>,
    (runsSoFar, agreement) =>
      pipe(
        Arr.last(runsSoFar),
        Option.filter(
          (run) =>
            run.period === agreement.period && run.lastSampleIndex + 1 === agreement.sampleIndex,
        ),
        Option.match({
          onNone: (): ReadonlyArray<AgreementRun> => [
            ...runsSoFar,
            {
              period: agreement.period,
              rankSum: rankSumOf(agreement.period),
              first: agreement.sample.at,
              last: agreement.sample.at,
              lastSampleIndex: agreement.sampleIndex,
            },
          ],
          onSome: (run): ReadonlyArray<AgreementRun> => [
            ...Arr.dropRight(runsSoFar, 1),
            { ...run, last: agreement.sample.at, lastSampleIndex: agreement.sampleIndex },
          ],
        }),
      ),
  );

  const conjoinedRule = fire(
    "timing.conjoined-period",
    "for",
    `${conjoinedPeriods} periods in the window have all three lords among the significators`,
  );
  if (runs.length === 0) {
    return {
      ...untimed(
        "no-transit-agreement",
        fire(
          "timing.no-transit-agreement",
          "against",
          "On no sampled day of those periods do all three lords transit stars of significators",
        ),
        conjoinedPeriods,
      ),
      rules: [
        conjoinedRule,
        fire(
          "timing.no-transit-agreement",
          "against",
          "On no sampled day of those periods do all three lords transit stars of significators",
        ),
      ],
    };
  }
  return {
    status: "windows",
    conjoinedPeriods,
    foundBeforeLimit: runs.length,
    windows: pipe(
      runs,
      Arr.sort(byRankSumThenStart),
      Arr.take(options.limit),
      Arr.map(({ period, first, last }, index): Window => ({
        rank: index + 1,
        dasha: period.dasha,
        bhukti: period.bhukti,
        antara: period.antara,
        start: first,
        end: DateTime.min(
          DateTime.min(DateTime.add(last, { days: sky.stepDays }), period.end),
          options.to,
        ),
      })),
    ),
    rules: [
      conjoinedRule,
      fire(
        "timing.transit-agreement",
        "for",
        `${runs.length} stretches inside those periods have all three lords transiting stars of significators`,
      ),
    ],
  };
}

export const ConfidenceLevel = Schema.Literals(["moderate", "low"]);
export type ConfidenceLevel = typeof ConfidenceLevel.Type;

const CONFIDENCE_CAPPED_AT: ConfidenceLevel = "moderate";

export const Confidence = Schema.Struct({
  level: ConfidenceLevel,
  calibrated: Schema.Literal(false),
  basis: Schema.Array(Schema.String),
});
export interface Confidence extends Schema.Schema.Type<typeof Confidence> {}

export const BIRTH_TIME_NOT_VERIFIED = "Birth time not verified";

function confidenceOf(
  promise: PromiseJudgment,
  timing: Timing,
  rulingPlanetsUsed: boolean,
  parenthesisedNotCounted: boolean,
): Confidence {
  const doubts = Arr.getSomes([
    when(
      promise.verdict === "not-indicated",
      "The guidebook gives no rule for this sub lord's significations",
    ),
    promise.verdict === "mixed" && promise.lean !== "favourable"
      ? Option.some(`Mixed promise leaning ${promise.lean}`)
      : Option.none(),
    when(
      timing.status === "no-conjoined-period",
      "No conjoined period of significators in the window",
    ),
    when(
      timing.status === "no-transit-agreement",
      "The period lords never transit stars of significators inside a conjoined period",
    ),
  ]);
  return {
    level: doubts.length > 0 ? "low" : CONFIDENCE_CAPPED_AT,
    calibrated: false,
    basis: [
      BIRTH_TIME_NOT_VERIFIED,
      "Sookshma refinement not applied",
      ...doubts,
      ...Arr.getSomes([
        when(!rulingPlanetsUsed, "Ruling planets not used to select significators"),
        when(parenthesisedNotCounted, "The guidebook's parenthesised houses were not counted"),
      ]),
    ],
  };
}

export const Judgment = Schema.Struct({
  school: Schema.Literal("KP"),
  engine: Schema.Literal(KP_JUDGE_VERSION),
  event: Schema.Struct({
    id: Schema.String,
    label: Schema.String,
    source: Provenance,
    primary: House,
    ...HouseGroup.fields,
  }),
  promise: PromiseJudgment,
  significators: Schema.Array(Significator),
  timing: Timing,
  confidence: Confidence,
});
export interface Judgment extends Schema.Schema.Type<typeof Judgment> {}

export function judgeKp(
  facts: KpFacts,
  event: KpEvent,
  periodsInTimeOrder: ReadonlyArray<KpPeriod>,
  sky: Sky,
  options: JudgeOptions,
): Judgment {
  const group = houseGroup(event);
  const promise = judgePromise(facts, event, group);
  const significators = rankSignificators(facts, group, options.rulingPlanets);
  const timing: Timing =
    isOnceOnly(event) && options.occurred.length > 0
      ? untimed(
          "already-occurred",
          fire(
            "timing.already-occurred",
            "neutral",
            "The person's memory records this once-only event, so no window is offered",
          ),
        )
      : VERDICT_ALLOWS_EVENT[promise.verdict] === 0
        ? untimed(
            "skipped",
            fire("timing.skipped", "neutral", "Timing is judged only once the matter is promised"),
          )
        : timeEvent(significators, periodsInTimeOrder, sky, options);

  return {
    school: "KP",
    engine: KP_JUDGE_VERSION,
    event: {
      id: event.id,
      label: event.label,
      source: houseGrouping(event.section),
      primary: event.primary,
      ...group,
    },
    promise,
    significators,
    timing,
    confidence: confidenceOf(
      promise,
      timing,
      Option.isSome(options.rulingPlanets),
      group.parenthesised.length > 0,
    ),
  };
}
