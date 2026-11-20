import type { Chart } from "astro-ascendant";
import { Array as Arr, DateTime, Option, Order, pipe, Schema } from "effect";

import type { House } from "./events.ts";
import {
  aspectedHouses,
  houseFrom,
  parsePeriodId,
  periodRows,
  placedIn,
  type Depth,
  type PeriodRow,
  type SignSample,
  type Timelines,
} from "./evidence.ts";
import { Planet, type KpFacts } from "./kp-judge.ts";

export const ChartRating = Schema.Literals(["weak", "fair", "strong"]);
export type ChartRating = typeof ChartRating.Type;

export const RankedWindow = Schema.Struct({
  rank: Schema.Int,
  id: Schema.String,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
  ageAtStart: Schema.Finite,
  sameDatesInParashari: Schema.String,
  kpScore: Schema.Finite,
  parashariScore: Schema.Finite,
  total: Schema.Finite,
  rating: ChartRating,
  why: Schema.String,
});
export interface RankedWindow extends Schema.Schema.Type<typeof RankedWindow> {}

export const RANKING_BASIS: ReadonlyArray<string> = [
  "Every period of the stretch is scored the same way, in each school's own calendar, and listed strongest first. The windows are the KP periods; each also carries the Parashari score of the Parashari periods that cover the same dates",
  "KP score: for each lord, the strongest level at which it signifies a house of the matter (level 1 counts 4, level 2 counts 3, level 3 counts 2, level 4 counts 1) minus the same for a detrimental house; plus 1 for Jupiter and 1 for Saturn if it transits a house of the matter by Placidus cusps during the period; plus 1 for each lord that was running at a recorded past event",
  "Parashari score: for each lord, 2 if it owns a house of the matter, 2 if it sits in one, 1 if it aspects one, 2 if it is the natural significator of the main house, plus 1 if exalted, in moolatrikona or in its own sign and minus 1 if debilitated; plus 1 for Jupiter and 1 for Saturn if it sits in a house of the matter or aspects the main house by whole signs during the period; plus 1 for each lord that was running at a recorded past event",
  "Each school's scores are scaled from 0 to 1 across the stretch and averaged into the total. The rating is strong from 0.66, fair from 0.4, weak below. The ranking counts connections; it does not weigh quality, yogas or the divisional charts, which is why a rating may be moved one step with a reason",
];

const STRONG_FROM = 0.66;
const FAIR_FROM = 0.4;

const LEVEL_WEIGHT = { 1: 4, 2: 3, 3: 2, 4: 1 } as const;
const LEVELS = [1, 2, 3, 4] as const;

const HOUSE_SIGNIFICATOR: Readonly<Record<House, Planet>> = {
  1: "Sun",
  2: "Jupiter",
  3: "Mars",
  4: "Moon",
  5: "Jupiter",
  6: "Mars",
  7: "Venus",
  8: "Saturn",
  9: "Jupiter",
  10: "Mercury",
  11: "Jupiter",
  12: "Saturn",
};

const STRONG_DIGNITIES: ReadonlyArray<string> = ["EXALTED", "MOOLA_TRIKONA", "OWN"];

export interface RankTopic {
  readonly conducive: ReadonlyArray<House>;
  readonly detrimental: ReadonlyArray<House>;
  readonly primary: House;
}

export interface RankInput {
  readonly timelines: Timelines;
  readonly depth: Depth;
  readonly window: { readonly start: DateTime.Utc; readonly end: DateTime.Utc };
  readonly birth: DateTime.Utc;
  readonly facts: KpFacts;
  readonly rashi: Chart.Chart;
  readonly topic: RankTopic;
  readonly slowSamples: Readonly<Record<"Jupiter" | "Saturn", ReadonlyArray<SignSample>>>;
  readonly lordsAtRecordedEvents: Readonly<Record<"kp" | "par", ReadonlyArray<string>>>;
}

const planetNamed = (name: string): Option.Option<Planet> =>
  Arr.findFirst(Planet.literals, (planet) => planet === name);

const strongestLevelWeight = (
  facts: KpFacts,
  planet: Planet,
  houses: ReadonlyArray<House>,
): number =>
  Arr.reduce(LEVELS, 0, (best, level) =>
    Arr.some(facts.planetSignifications[planet][`level${level}`], (house) =>
      Arr.contains(houses, house),
    )
      ? Math.max(best, LEVEL_WEIGHT[level])
      : best,
  );

export const kpLordScore = (planet: Planet, facts: KpFacts, topic: RankTopic): number =>
  strongestLevelWeight(facts, planet, topic.conducive) -
  strongestLevelWeight(facts, planet, topic.detrimental);

export const parashariLordScore = (
  planet: Planet,
  rashi: Chart.Chart,
  topic: RankTopic,
): number => {
  const place = Arr.findFirst(placedIn(rashi), (entry) => entry.planet.name === planet);
  const owns = Arr.some(topic.conducive, (house) => rashi.houses[house].signLord === planet);
  const sitsIn = Option.exists(place, (entry) => Arr.contains(topic.conducive, entry.house));
  const aspects = Option.exists(place, (entry) =>
    Arr.some(aspectedHouses(planet, entry.house), (house) => Arr.contains(topic.conducive, house)),
  );
  const dignity = Option.match(place, {
    onNone: () => 0,
    onSome: (entry) =>
      Arr.some(entry.planet.in_sign, (state) => Arr.contains(STRONG_DIGNITIES, state))
        ? 1
        : Arr.contains(entry.planet.in_sign, "DEBILITATED")
          ? -1
          : 0,
  });
  return (
    (owns ? 2 : 0) +
    (sitsIn ? 2 : 0) +
    (aspects ? 1 : 0) +
    (HOUSE_SIGNIFICATOR[topic.primary] === planet ? 2 : 0) +
    dignity
  );
};

const within = (sample: SignSample, row: PeriodRow): boolean =>
  DateTime.isGreaterThanOrEqualTo(sample.at, row.start) && DateTime.isLessThan(sample.at, row.end);

const lordsOf = (id: string): ReadonlyArray<Planet> =>
  pipe(
    parsePeriodId(id),
    Option.match({ onNone: () => [], onSome: (parsed) => parsed.lords }),
    Arr.map(planetNamed),
    Arr.getSomes,
  );

const sum = (values: ReadonlyArray<number>): number =>
  Arr.reduce(values, 0, (total, value) => total + value);

const sharedWithRecord = (lords: ReadonlyArray<Planet>, recorded: ReadonlyArray<string>): number =>
  Arr.filter(Arr.dedupe(lords), (lord) => Arr.contains(recorded, lord)).length;

const rawKp = (row: PeriodRow, input: RankInput): number => {
  const lords = lordsOf(row.id);
  const transits = Arr.filter(["Jupiter", "Saturn"] as const, (planet) =>
    Arr.some(
      input.slowSamples[planet],
      (sample) => within(sample, row) && Arr.contains(input.topic.conducive, sample.kpHouse),
    ),
  ).length;
  return (
    sum(Arr.map(lords, (lord) => kpLordScore(lord, input.facts, input.topic))) +
    transits +
    sharedWithRecord(lords, input.lordsAtRecordedEvents.kp)
  );
};

const rawParashari = (row: PeriodRow, input: RankInput): number => {
  const lords = lordsOf(row.id);
  const lagnaSign = input.rashi.houses[1].sign;
  const transits = Arr.filter(["Jupiter", "Saturn"] as const, (planet) =>
    Arr.some(input.slowSamples[planet], (sample) => {
      const house = houseFrom(lagnaSign, sample.sign) as House;
      return (
        within(sample, row) &&
        (Arr.contains(input.topic.conducive, house) ||
          Arr.contains(aspectedHouses(planet, house), input.topic.primary))
      );
    }),
  ).length;
  return (
    sum(Arr.map(lords, (lord) => parashariLordScore(lord, input.rashi, input.topic))) +
    transits +
    sharedWithRecord(lords, input.lordsAtRecordedEvents.par)
  );
};

const millis = (moment: DateTime.Utc): number => DateTime.toEpochMillis(moment);

const overlapShare = (window: PeriodRow, other: PeriodRow): number =>
  Math.max(
    0,
    Math.min(millis(window.end), millis(other.end)) -
      Math.max(millis(window.start), millis(other.start)),
  ) /
  (millis(window.end) - millis(window.start));

const scaled = (values: ReadonlyArray<number>): ReadonlyArray<number> => {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  return Arr.map(values, (value) =>
    highest === lowest ? 0.5 : (value - lowest) / (highest - lowest),
  );
};

const ratingOf = (total: number): ChartRating =>
  total >= STRONG_FROM ? "strong" : total >= FAIR_FROM ? "fair" : "weak";

const round = (value: number, digits: number): number =>
  Math.round(value * 10 ** digits) / 10 ** digits;

interface Scored {
  readonly row: PeriodRow;
  readonly covering: ReadonlyArray<PeriodRow>;
  readonly kp: number;
  readonly parashari: number;
}

interface Totalled {
  readonly total: number;
  readonly row: PeriodRow;
}

const strongestFirst: Order.Order<Totalled> = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (entry: Totalled) => entry.total),
  Order.mapInput(DateTime.Order, (entry: Totalled) => entry.row.start),
);

export function rankWindows(input: RankInput): ReadonlyArray<RankedWindow> {
  const kpRows = periodRows(input.timelines.kp, "kp", input.depth, input.window, input.birth);
  if (kpRows.length === 0) return [];
  const span = {
    start: Arr.reduce(kpRows, input.window.start, (earliest, row) =>
      DateTime.min(earliest, row.start),
    ),
    end: Arr.reduce(kpRows, input.window.end, (latest, row) => DateTime.max(latest, row.end)),
  };
  const parashariRows = periodRows(input.timelines.par, "par", input.depth, span, input.birth);
  const parashariRaw = Arr.map(parashariRows, (row) => rawParashari(row, input));

  const scored = Arr.map(kpRows, (row): Scored => {
    const shares = Arr.map(parashariRows, (other) => overlapShare(row, other));
    return {
      row,
      covering: Arr.filter(parashariRows, (_, index) => (shares[index] ?? 0) > 0),
      kp: rawKp(row, input),
      parashari: sum(Arr.map(shares, (share, index) => share * (parashariRaw[index] ?? 0))),
    };
  });
  const kpScaled = scaled(Arr.map(scored, (entry) => entry.kp));
  const parashariScaled = scaled(Arr.map(scored, (entry) => entry.parashari));

  return pipe(
    scored,
    Arr.map((entry, index) => ({
      ...entry,
      total: ((kpScaled[index] ?? 0) + (parashariScaled[index] ?? 0)) / 2,
    })),
    Arr.sort(strongestFirst),
    Arr.map((entry, index): RankedWindow => ({
      rank: index + 1,
      id: entry.row.id,
      start: entry.row.start,
      end: entry.row.end,
      ageAtStart: entry.row.ageAtStart,
      sameDatesInParashari: Arr.map(entry.covering, (row) => row.id).join(", ") || "none",
      kpScore: round(entry.kp, 1),
      parashariScore: round(entry.parashari, 1),
      total: round(entry.total, 2),
      rating: ratingOf(entry.total),
      why: `KP lords ${Arr.map(lordsOf(entry.row.id), (lord) => `${lord} ${kpLordScore(lord, input.facts, input.topic)}`).join(", ")}; Parashari lords ${Arr.map(
        Arr.dedupe(Arr.flatMap(entry.covering, (row) => lordsOf(row.id))),
        (lord) => `${lord} ${parashariLordScore(lord, input.rashi, input.topic)}`,
      ).join(", ")}`,
    })),
  );
}
