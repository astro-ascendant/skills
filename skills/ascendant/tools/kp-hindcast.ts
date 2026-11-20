import type { KpEvent } from "./events.ts";
import {
  houseGroup,
  judgePromise,
  rankSignificators,
  type Confidence,
  type KpFacts,
  type KpPeriod,
  type Planet,
  type Verdict,
} from "./kp-judge.ts";

/**
 * Checks the KP rules against events that already happened. Pure, like
 * `kp-judge.ts`. Nothing here comes from the guidebook: it is the engine
 * testing itself on one person's past, so every rule is an engine choice.
 */

export interface PastEvent {
  readonly date: string;
  /** Epoch milliseconds. */
  readonly at: number;
  readonly event: KpEvent;
}

export interface Fit {
  readonly date: string;
  readonly event: string;
  /** What the promise rule says about an event that did happen. */
  readonly verdict: Verdict;
  /** Whether the date falls in a period whose three lords are all significators. */
  readonly inConjoinedPeriod: boolean;
  readonly lords: ReadonlyArray<Planet>;
  /**
   * Share of the life span covered by such periods, 0 to 1. A hit means little
   * when this is near 1: the date would have fallen in a qualifying period by
   * chance.
   */
  readonly coverage: number;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** How one past event sits against the chart, over the span `from` to `to`. */
export function fitPastEvent(
  facts: KpFacts,
  periods: ReadonlyArray<KpPeriod>,
  past: PastEvent,
  span: { readonly from: number; readonly to: number },
): Fit {
  const group = houseGroup(past.event);
  const significators = new Set(
    rankSignificators(facts, group, undefined).map((entry) => entry.planet),
  );
  const conjoined = (period: KpPeriod) =>
    significators.has(period.dasha) &&
    significators.has(period.bhukti) &&
    significators.has(period.antara);
  const running = periods.find((period) => period.start <= past.at && past.at < period.end);
  const covered = periods.reduce((sum, period) => {
    const overlap = Math.min(period.end, span.to) - Math.max(period.start, span.from);
    return conjoined(period) && overlap > 0 ? sum + overlap : sum;
  }, 0);
  return {
    date: past.date,
    event: past.event.id,
    verdict: judgePromise(facts, past.event, group).verdict,
    inConjoinedPeriod: running !== undefined && conjoined(running),
    lords: running === undefined ? [] : [running.dasha, running.bhukti, running.antara],
    coverage: span.to > span.from ? round(covered / (span.to - span.from)) : 0,
  };
}

/** One point when the promise allows the event, one when its period qualifies. */
export const scoreFit = (fit: Fit): number =>
  (fit.verdict === "promised" || fit.verdict === "mixed" ? 1 : 0) + (fit.inConjoinedPeriod ? 1 : 0);

export const MIN_PAST_EVENTS = 3;

export interface Trial {
  /** Minutes added to the recorded birth time; 0 is the recorded time. */
  readonly offsetMinutes: number;
  readonly score: number;
}

export type BirthTimeStatus = "consistent" | "suspect" | "uninformative" | "unverified";

export interface BirthTime {
  readonly status: BirthTimeStatus;
  readonly pastEvents: number;
  readonly windowMinutes: number;
  readonly recordedScore?: number;
  readonly bestScore?: number;
  /** Offsets, in minutes, of the trial moments that fit the past events best. */
  readonly bestOffsets?: ReadonlyArray<number>;
  /** Set only when exactly one trial moment fits best and it is not the recorded one. */
  readonly provisionalOffsetMinutes?: number;
  readonly detail: string;
}

/**
 * Compares the recorded birth time with trial moments around it, by how well
 * each fits the past events. It replaces the ruling-planets test at "now",
 * whose answer changes with the moment of asking.
 *
 * - Fewer than three past events: `unverified`.
 * - Every trial scores the same: `uninformative`, the events cannot tell the
 *   moments apart.
 * - The recorded moment scores best: `consistent`.
 * - Otherwise `suspect`, with a provisional offset only when one trial alone
 *   scores best.
 */
export function checkBirthTime(
  trials: ReadonlyArray<Trial>,
  pastEvents: number,
  windowMinutes: number,
): BirthTime {
  const base = { pastEvents, windowMinutes };
  const recorded = trials.find((trial) => trial.offsetMinutes === 0);
  if (pastEvents < MIN_PAST_EVENTS || windowMinutes === 0 || recorded === undefined) {
    return {
      ...base,
      status: "unverified",
      detail:
        pastEvents < MIN_PAST_EVENTS
          ? `Fewer than ${MIN_PAST_EVENTS} tagged past events`
          : "Birth-time check switched off",
    };
  }
  const bestScore = Math.max(...trials.map((trial) => trial.score));
  const worstScore = Math.min(...trials.map((trial) => trial.score));
  const bestOffsets = trials
    .filter((trial) => trial.score === bestScore)
    .map((trial) => trial.offsetMinutes);
  const scores = { recordedScore: recorded.score, bestScore, bestOffsets };
  if (bestScore === worstScore) {
    return {
      ...base,
      ...scores,
      status: "uninformative",
      detail: "Every trial moment fits the past events equally",
    };
  }
  if (recorded.score === bestScore) {
    return {
      ...base,
      ...scores,
      status: "consistent",
      detail: "No trial moment fits the past events better than the recorded one",
    };
  }
  const [only, ...rest] = bestOffsets;
  return only !== undefined && rest.length === 0
    ? {
        ...base,
        ...scores,
        status: "suspect",
        provisionalOffsetMinutes: only,
        detail: `Past events fit best ${only} minutes from the recorded time`,
      }
    : {
        ...base,
        ...scores,
        status: "suspect",
        detail: "Several trial moments fit the past events better than the recorded one",
      };
}

const NOT_VERIFIED = "Birth time not verified";
const HIGH_COVERAGE = 0.8;

/** Adjusts the judgment's confidence for what the past events showed. */
export function confidenceWithMemory(
  confidence: Confidence,
  birthTime: BirthTime,
  fits: ReadonlyArray<Fit>,
): Confidence {
  const basis = confidence.basis.filter((reason) => reason !== NOT_VERIFIED);
  let low = confidence.level === "low";
  if (birthTime.status === "consistent") {
    basis.unshift(
      `Birth time consistent with ${birthTime.pastEvents} past events within ${birthTime.windowMinutes} minutes`,
    );
  } else {
    basis.unshift(`${NOT_VERIFIED}: ${birthTime.detail}`);
    if (birthTime.status === "suspect") low = true;
  }

  const denied = fits.filter((fit) => fit.verdict === "denied").length;
  if (denied > 0) {
    basis.push(`The promise rule denies ${denied} past events that did happen`);
    low = true;
  }
  const missed = fits.filter((fit) => !fit.inConjoinedPeriod).length;
  if (missed > 0) {
    basis.push(`${missed} past events fell outside a conjoined period of significators`);
    low = true;
  }
  if (fits.length > 0 && fits.every((fit) => fit.coverage >= HIGH_COVERAGE)) {
    basis.push(
      "Conjoined periods cover most of the life span, so past events falling inside them is weak evidence",
    );
  }
  return { level: low ? "low" : "moderate", calibrated: false, basis };
}
