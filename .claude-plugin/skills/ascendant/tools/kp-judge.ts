import { Chart } from "astro-ascendant";

import type { House, KpEvent } from "./events.ts";

/**
 * The KP judgment as pure functions: the same facts, event and window always
 * give the same judgment. No clock, no file access, no model. Every rule names
 * the guidebook section it comes from, and every place where the guidebook is
 * silent and this file had to choose is marked "Engine choice".
 */

export const KP_JUDGE_VERSION = "kp-judge/1";

export type Planet = Chart.Planets;

const PLANETS: ReadonlyArray<Planet> = Chart.Planets.literals;
const HOUSES: ReadonlyArray<House> = Chart.Houses.literals;

const PRINCIPLES = "kp/fundamental-principles.md";
const GROUPING = "kp/house-grouping.md";

export interface Levels<A> {
  readonly level1: ReadonlyArray<A>;
  readonly level2: ReadonlyArray<A>;
  readonly level3: ReadonlyArray<A>;
  readonly level4: ReadonlyArray<A>;
}

/** Everything the rules read from one KP D1. */
export interface KpFacts {
  readonly cuspSubLords: Readonly<Record<House, Planet>>;
  readonly planetStarLords: Readonly<Record<Planet, Planet>>;
  readonly planetSubLords: Readonly<Record<Planet, Planet>>;
  readonly planetSignifications: Readonly<Record<Planet, Levels<House>>>;
  readonly houseSignificators: Readonly<Record<House, Levels<Planet>>>;
}

/** One antara (third level) period; `start` and `end` are epoch milliseconds. */
export interface KpPeriod {
  readonly dasha: Planet;
  readonly bhukti: Planet;
  readonly antara: Planet;
  readonly start: number;
  readonly end: number;
}

export interface JudgeOptions {
  /** Window start and end, epoch milliseconds. */
  readonly from: number;
  readonly to: number;
  /** Most windows to return. */
  readonly limit: number;
  /** Ruling planets of the judgment moment, when the caller supplies one. */
  readonly rulingPlanets?: ReadonlyArray<Planet>;
}

export type Level = 1 | 2 | 3 | 4;
export type Role = "conducive" | "detrimental" | "optional" | "other";
export type Verdict = "promised" | "mixed" | "denied" | "not-indicated";
export type Lean = "favourable" | "balanced" | "unfavourable";
export type Polarity = "for" | "against" | "neutral";

export interface RuleFiring {
  readonly rule: string;
  /** Guidebook file and named section, or `engine` for an engine choice. */
  readonly source: string;
  readonly polarity: Polarity;
  readonly detail: string;
}

export interface HouseGroup {
  readonly conducive: ReadonlyArray<House>;
  readonly optional: ReadonlyArray<House>;
  readonly detrimental: ReadonlyArray<House>;
}

export interface Signification {
  readonly house: House;
  readonly level: Level;
  /** 1 is strongest. Differs from `level` for a self-strength planet. */
  readonly strength: Level;
  readonly role: Role;
}

const sortNumbers = <A extends number>(values: Iterable<A>): Array<A> =>
  [...new Set(values)].sort((left, right) => left - right);

export const twelfthFrom = (house: House): House => (house === 1 ? 12 : ((house - 1) as House));

/**
 * Conducive houses are the primary plus the supporting column. Detrimental
 * houses are the 12th from each conducive house
 * (`Good and Bad Houses for Specific Matters`).
 *
 * Engine choice: a house that is both conducive and 12th from another
 * conducive house stays conducive (for Service 6-7-10, the 6th is not counted
 * against the matter).
 */
export function houseGroup(event: KpEvent): HouseGroup {
  const conducive = sortNumbers([event.primary, ...event.supporting]);
  const optional = sortNumbers(event.optional.filter((house) => !conducive.includes(house)));
  const detrimental = sortNumbers(
    conducive.map(twelfthFrom).filter((house) => !conducive.includes(house)),
  );
  return { conducive, optional, detrimental };
}

/**
 * A planet with no planet in its stars is a self-strength planet
 * (`Strengths of Significators`).
 *
 * Engine choice: a planet sitting in its own star counts as a tenant, so that
 * planet is not self-strength.
 */
export function isSelfStrength(facts: KpFacts, planet: Planet): boolean {
  return !PLANETS.some((other) => facts.planetStarLords[other] === planet);
}

const NORMAL_ORDER: Readonly<Record<Level, Level>> = { 1: 1, 2: 2, 3: 3, 4: 4 };
const SELF_STRENGTH_ORDER: Readonly<Record<Level, Level>> = { 2: 1, 1: 2, 4: 3, 3: 4 };

const roleOf = (group: HouseGroup, house: House): Role =>
  group.conducive.includes(house)
    ? "conducive"
    : group.detrimental.includes(house)
      ? "detrimental"
      : group.optional.includes(house)
        ? "optional"
        : "other";

const levelsOf = <A>(levels: Levels<A>): ReadonlyArray<readonly [Level, ReadonlyArray<A>]> => [
  [1, levels.level1],
  [2, levels.level2],
  [3, levels.level3],
  [4, levels.level4],
];

/**
 * The houses a planet signifies, strongest first, one entry per house at its
 * strongest level (`Finding Signification of Planets`, reordered for a
 * self-strength planet by `Strengths of Significators`).
 */
export function significationsOf(
  facts: KpFacts,
  planet: Planet,
  group: HouseGroup,
): ReadonlyArray<Signification> {
  const order = isSelfStrength(facts, planet) ? SELF_STRENGTH_ORDER : NORMAL_ORDER;
  const best = new Map<House, Signification>();
  for (const [level, houses] of levelsOf(facts.planetSignifications[planet])) {
    for (const house of houses) {
      const strength = order[level];
      const current = best.get(house);
      if (current === undefined || strength < current.strength) {
        best.set(house, { house, level, strength, role: roleOf(group, house) });
      }
    }
  }
  return [...best.values()].sort(
    (left, right) => left.strength - right.strength || left.house - right.house,
  );
}

export interface PromiseJudgment {
  readonly cusp: House;
  readonly subLord: Planet;
  readonly selfStrength: boolean;
  readonly significations: ReadonlyArray<Signification>;
  readonly verdict: Verdict;
  /** Present only for a mixed verdict. */
  readonly lean?: Lean;
  readonly rules: ReadonlyArray<RuleFiring>;
}

const strongest = (significations: ReadonlyArray<Signification>, role: Role): Level | undefined =>
  significations.find((signification) => signification.role === role)?.strength;

const housesWith = (significations: ReadonlyArray<Signification>, role: Role): string =>
  significations
    .filter((signification) => signification.role === role)
    .map((signification) => `${signification.house} (level ${signification.level})`)
    .join(", ");

/**
 * The sub lord of the primary cusp decides the promise
 * (`Finding out promises in a chart`, rules 1 to 4).
 *
 * Engine choice: the guidebook gives no rule for a sub lord that signifies
 * neither a conducive nor a detrimental house; that is reported as
 * `not-indicated`, not as a denial.
 */
export function judgePromise(facts: KpFacts, event: KpEvent, group: HouseGroup): PromiseJudgment {
  const source = `${PRINCIPLES}:Finding out promises in a chart`;
  const subLord = facts.cuspSubLords[event.primary];
  const selfStrength = isSelfStrength(facts, subLord);
  const significations = significationsOf(facts, subLord, group);
  const conducive = strongest(significations, "conducive");
  const detrimental = strongest(significations, "detrimental");
  const rules: Array<RuleFiring> = [];

  if (selfStrength) {
    rules.push({
      rule: "promise.self-strength-order",
      source: `${PRINCIPLES}:Strengths of Significators`,
      polarity: "neutral",
      detail: `${subLord} has no planet in its stars, so its levels are read in the order 2, 1, 4, 3`,
    });
  }
  if (conducive !== undefined) {
    rules.push({
      rule: "promise.conducive-house",
      source,
      polarity: "for",
      detail: `Sub lord ${subLord} of cusp ${event.primary} signifies conducive houses ${housesWith(significations, "conducive")}`,
    });
  }
  if (detrimental !== undefined) {
    rules.push({
      rule: "promise.detrimental-house",
      source,
      polarity: "against",
      detail: `Sub lord ${subLord} of cusp ${event.primary} signifies detrimental houses ${housesWith(significations, "detrimental")}`,
    });
  }

  const base = { cusp: event.primary, subLord, selfStrength, significations };
  if (conducive !== undefined && detrimental === undefined) {
    return { ...base, verdict: "promised", rules };
  }
  if (conducive === undefined && detrimental !== undefined) {
    return { ...base, verdict: "denied", rules };
  }
  if (conducive === undefined || detrimental === undefined) {
    rules.push({
      rule: "promise.no-rule",
      source: "engine",
      polarity: "neutral",
      detail: `Sub lord ${subLord} signifies neither a conducive nor a detrimental house; the guidebook gives no rule for this case`,
    });
    return { ...base, verdict: "not-indicated", rules };
  }

  const lean: Lean =
    conducive < detrimental ? "favourable" : conducive > detrimental ? "unfavourable" : "balanced";
  rules.push({
    rule: "promise.hierarchy",
    source,
    polarity: lean === "favourable" ? "for" : lean === "unfavourable" ? "against" : "neutral",
    detail: `Strongest conducive signification is at strength ${conducive} and strongest detrimental at strength ${detrimental} (1 is strongest)`,
  });
  return { ...base, verdict: "mixed", lean, rules };
}

export type Criterion =
  | "ruling-planet"
  | "in-star-of-cusp-sub-lord"
  | "is-cusp-sub-lord"
  | "in-sub-of-untenanted-significator";

export type Weakness = "detrimental-house" | "detrimental-sub";

export interface Significator {
  readonly rank: number;
  readonly planet: Planet;
  /** Conducive houses the planet signifies, each at its strongest level. */
  readonly houses: ReadonlyArray<{ readonly house: House; readonly level: Level }>;
  readonly detrimentalHouses: ReadonlyArray<{ readonly house: House; readonly level: Level }>;
  readonly criteria: ReadonlyArray<Criterion>;
  readonly weakened: ReadonlyArray<Weakness>;
}

const housesSignifiedBy = (
  facts: KpFacts,
  planet: Planet,
  houses: ReadonlyArray<House>,
): ReadonlyArray<{ readonly house: House; readonly level: Level }> =>
  houses.flatMap((house) => {
    const hit = levelsOf(facts.houseSignificators[house]).find(([, planets]) =>
      planets.includes(planet),
    );
    return hit === undefined ? [] : [{ house, level: hit[0] }];
  });

const bestLevel = (houses: ReadonlyArray<{ readonly level: Level }>): number =>
  houses.reduce((best, entry) => Math.min(best, entry.level), 5);

/**
 * Significators of the conducive houses (`Finding House Significators`),
 * ranked strongest first.
 *
 * Elimination comes first (`Selection of Significators`, methods 1 and 2), then
 * the ordered steps of `Selection of Fruitful significator: A Step by Step
 * Approach`. The order is lexicographic, with no numeric weights.
 *
 * Engine choices: a planet is marked `detrimental-house` only when it signifies
 * a detrimental house at a stronger level than any conducive house (nearly
 * every planet signifies some detrimental house, so the literal rule would
 * remove everything). A planet is marked `detrimental-sub` when its sub lord
 * signifies a detrimental house and no conducive house. Marked planets are
 * ranked last, not removed. Ties end on the fixed planet order.
 */
export function rankSignificators(
  facts: KpFacts,
  group: HouseGroup,
  rulingPlanets: ReadonlyArray<Planet> | undefined,
): ReadonlyArray<Significator> {
  const cuspSubLords = new Set(group.conducive.map((house) => facts.cuspSubLords[house]));
  const conduciveOf = (planet: Planet) => housesSignifiedBy(facts, planet, group.conducive);
  const detrimentalOf = (planet: Planet) => housesSignifiedBy(facts, planet, group.detrimental);
  const significatorSet = new Set(PLANETS.filter((planet) => conduciveOf(planet).length > 0));

  const unranked = [...significatorSet].map((planet) => {
    const houses = conduciveOf(planet);
    const detrimentalHouses = detrimentalOf(planet);
    const subLord = facts.planetSubLords[planet];

    const criteria: Array<Criterion> = [];
    if (rulingPlanets?.includes(planet)) criteria.push("ruling-planet");
    if (cuspSubLords.has(facts.planetStarLords[planet])) criteria.push("in-star-of-cusp-sub-lord");
    if (cuspSubLords.has(planet)) criteria.push("is-cusp-sub-lord");
    if (significatorSet.has(subLord) && isSelfStrength(facts, subLord)) {
      criteria.push("in-sub-of-untenanted-significator");
    }

    const weakened: Array<Weakness> = [];
    if (bestLevel(detrimentalHouses) < bestLevel(houses)) weakened.push("detrimental-house");
    if (detrimentalOf(subLord).length > 0 && conduciveOf(subLord).length === 0) {
      weakened.push("detrimental-sub");
    }

    return { planet, houses, detrimentalHouses, criteria, weakened };
  });

  const has = (entry: (typeof unranked)[number], criterion: Criterion) =>
    entry.criteria.includes(criterion) ? 0 : 1;
  const key = (entry: (typeof unranked)[number]): ReadonlyArray<number> => [
    entry.weakened.length,
    has(entry, "ruling-planet"),
    has(entry, "in-star-of-cusp-sub-lord"),
    has(entry, "is-cusp-sub-lord"),
    has(entry, "in-sub-of-untenanted-significator"),
    -entry.houses.length,
    bestLevel(entry.houses),
    entry.detrimentalHouses.length,
    PLANETS.indexOf(entry.planet),
  ];
  const compare = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
    for (let index = 0; index < left.length; index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  };

  return unranked
    .sort((left, right) => compare(key(left), key(right)))
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

export interface Window {
  readonly rank: number;
  readonly dasha: Planet;
  readonly bhukti: Planet;
  readonly antara: Planet;
  readonly start: number;
  readonly end: number;
}

export type TimingStatus = "windows" | "no-conjoined-period" | "skipped";

export interface Timing {
  readonly status: TimingStatus;
  readonly windows: ReadonlyArray<Window>;
  /** Conjoined periods found in the window before `limit` was applied. */
  readonly found: number;
  readonly rules: ReadonlyArray<RuleFiring>;
}

/**
 * The matter fructifies in the conjoined dasha, bhukti and antara of
 * significators of the house group (`Timing Events`). Only the part of a
 * period inside the window is returned.
 *
 * Engine choice: periods are ordered by the summed significator ranks of their
 * three lords, then by start; the guidebook says only to prefer the more
 * powerful significators.
 */
export function timeEvent(
  significators: ReadonlyArray<Significator>,
  periods: ReadonlyArray<KpPeriod>,
  options: JudgeOptions,
): Timing {
  const source = `${PRINCIPLES}:Timing Events`;
  const rankOf = new Map(significators.map((entry) => [entry.planet, entry.rank]));
  const scored = periods.flatMap((period) => {
    const ranks = [period.dasha, period.bhukti, period.antara].map((lord) => rankOf.get(lord));
    if (period.end <= options.from || period.start >= options.to) return [];
    if (ranks.some((rank) => rank === undefined)) return [];
    const score = ranks.reduce<number>((sum, rank) => sum + (rank ?? 0), 0);
    return [{ period, score }];
  });
  scored.sort((left, right) => left.score - right.score || left.period.start - right.period.start);

  if (scored.length === 0) {
    return {
      status: "no-conjoined-period",
      windows: [],
      found: 0,
      rules: [
        {
          rule: "timing.no-conjoined-period",
          source,
          polarity: "against",
          detail:
            "No dasha, bhukti and antara in the window are all significators of the house group",
        },
      ],
    };
  }

  return {
    status: "windows",
    found: scored.length,
    windows: scored.slice(0, options.limit).map(({ period }, index) => ({
      rank: index + 1,
      dasha: period.dasha,
      bhukti: period.bhukti,
      antara: period.antara,
      start: Math.max(period.start, options.from),
      end: Math.min(period.end, options.to),
    })),
    rules: [
      {
        rule: "timing.conjoined-period",
        source,
        polarity: "for",
        detail: `${scored.length} periods in the window have all three lords among the significators`,
      },
    ],
  };
}

export type ConfidenceLevel = "moderate" | "low";

export interface Confidence {
  readonly level: ConfidenceLevel;
  /** Always false: no rule here has been scored against real outcomes yet. */
  readonly calibrated: false;
  readonly basis: ReadonlyArray<string>;
}

/**
 * Engine choice, not a guidebook rule: a coarse level from what the judgment
 * rests on. It never reaches "high" because the birth time is not verified and
 * the rules are not calibrated.
 */
function confidenceOf(
  promise: PromiseJudgment,
  timing: Timing,
  rulingPlanets: boolean,
  optional: boolean,
): Confidence {
  const basis = ["Birth time not verified", "Transit and sookshma refinement not applied"];
  let low = false;
  if (promise.verdict === "not-indicated") {
    basis.push("The guidebook gives no rule for this sub lord's significations");
    low = true;
  }
  if (promise.verdict === "mixed" && promise.lean !== "favourable") {
    basis.push(`Mixed promise leaning ${promise.lean}`);
    low = true;
  }
  if (timing.status === "no-conjoined-period") {
    basis.push("No conjoined period of significators in the window");
    low = true;
  }
  if (!rulingPlanets) basis.push("Ruling planets not used to select significators");
  if (optional) basis.push("The guidebook's parenthesised houses were not counted");
  return { level: low ? "low" : "moderate", calibrated: false, basis };
}

export interface Judgment {
  readonly school: "KP";
  readonly engine: typeof KP_JUDGE_VERSION;
  readonly event: {
    readonly id: string;
    readonly label: string;
    readonly source: string;
    readonly primary: House;
    readonly conducive: ReadonlyArray<House>;
    readonly optional: ReadonlyArray<House>;
    readonly detrimental: ReadonlyArray<House>;
  };
  readonly promise: PromiseJudgment;
  readonly significators: ReadonlyArray<Significator>;
  readonly timing: Timing;
  readonly confidence: Confidence;
}

/** The whole KP judgment for one event and one time window. */
export function judgeKp(
  facts: KpFacts,
  event: KpEvent,
  periods: ReadonlyArray<KpPeriod>,
  options: JudgeOptions,
): Judgment {
  const group = houseGroup(event);
  const promise = judgePromise(facts, event, group);
  const significators = rankSignificators(facts, group, options.rulingPlanets);
  const timing: Timing =
    promise.verdict === "denied" || promise.verdict === "not-indicated"
      ? {
          status: "skipped",
          windows: [],
          found: 0,
          rules: [
            {
              rule: "timing.skipped",
              source: `${PRINCIPLES}:Timing Events`,
              polarity: "neutral",
              detail: "Timing is judged only once the matter is promised",
            },
          ],
        }
      : timeEvent(significators, periods, options);

  return {
    school: "KP",
    engine: KP_JUDGE_VERSION,
    event: {
      id: event.id,
      label: event.label,
      source: `${GROUPING}:${event.section}`,
      primary: event.primary,
      ...group,
    },
    promise,
    significators,
    timing,
    confidence: confidenceOf(
      promise,
      timing,
      options.rulingPlanets !== undefined,
      group.optional.length > 0,
    ),
  };
}

/** Houses in order, for building `KpFacts` records. */
export const KP_HOUSES = HOUSES;
/** Planets in the engine's fixed order, for building `KpFacts` records. */
export const KP_PLANETS = PLANETS;
