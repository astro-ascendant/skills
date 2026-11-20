import { Chart, Dasha } from "astro-ascendant";
import { Array as Arr, DateTime, Option, pipe, Schema } from "effect";

import { House, type KpEvent } from "./events.ts";
import { houseGroup, judgePromise, Planet, type KpFacts } from "./kp-judge.ts";
import { kpCuspAndPlanetLords, padaOf, starLordOf, starNameOf } from "./kp-lords.ts";
import type { Memory } from "./memory.ts";

export const Fact = Schema.Struct({ id: Schema.String, text: Schema.String });
export interface Fact extends Schema.Schema.Type<typeof Fact> {}

interface HouseFact extends Fact {
  readonly house: Option.Option<House>;
}

export const Depth = Schema.Literals(["dasha", "bhukti", "antara", "sookshma"]);
export type Depth = typeof Depth.Type;

export const PeriodRow = Schema.Struct({
  id: Schema.String,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
  ageAtStart: Schema.Finite,
});
export interface PeriodRow extends Schema.Schema.Type<typeof PeriodRow> {}

export type Timeline = ReadonlyArray<{
  readonly mahadasha: Planet;
  readonly start: DateTime.Utc;
  readonly end: DateTime.Utc;
  readonly antardashas: ReadonlyArray<{
    readonly mahadasha: Planet;
    readonly antardasha: Planet;
    readonly start: DateTime.Utc;
    readonly end: DateTime.Utc;
  }>;
}>;

interface Span {
  readonly start: DateTime.Utc;
  readonly end: DateTime.Utc;
}

interface LordedSpan extends Span {
  readonly lords: ReadonlyArray<Planet>;
}

const PLANETS: ReadonlyArray<Planet> = Planet.literals;
const HOUSES: ReadonlyArray<House> = House.literals;
const LEVELS = [1, 2, 3, 4] as const;
const ANTARA_LORDS = 3;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const list = (values: ReadonlyArray<string | number>): string =>
  values.length === 0 ? "none" : values.join(", ");

const houseAt = (from: House, offset: number): House =>
  HOUSES[(from - 1 + offset) % HOUSES.length] ?? from;

export const PERIOD_ID_SEPARATOR = "-";

export const SPECIAL_ASPECT_OFFSETS: Readonly<Partial<Record<Planet, ReadonlyArray<number>>>> = {
  Mars: [3, 7],
  Jupiter: [4, 8],
  Saturn: [2, 9],
};

const SEVENTH = 6;

export const aspectedHouses = (planet: Planet, from: House): ReadonlyArray<House> =>
  planet === "Rahu" || planet === "Ketu"
    ? []
    : Arr.map([SEVENTH, ...(SPECIAL_ASPECT_OFFSETS[planet] ?? [])], (offset) =>
        houseAt(from, offset),
      );

interface Placed {
  readonly planet: Chart.Planet;
  readonly house: House;
}

const placedIn = (chart: Chart.Chart): ReadonlyArray<Placed> =>
  Arr.flatMap(HOUSES, (house) =>
    Arr.map(chart.houses[house].planets, (planet): Placed => ({ planet, house })),
  );

const separation = (left: number, right: number): number => {
  const apart = Math.abs(left - right) % 360;
  return Math.round((apart > 180 ? 360 - apart : apart) * 10) / 10;
};

export function kpChartFacts(chart: Chart.D1Chart, facts: KpFacts): ReadonlyArray<HouseFact> {
  const lords = kpCuspAndPlanetLords(chart);
  const hasTenants = (planet: Planet): boolean =>
    Arr.some(PLANETS, (tenant) => facts.planetStarLords[tenant] === planet);
  const levelsOf = <A extends string | number>(
    levels: Readonly<Record<`level${1 | 2 | 3 | 4}`, ReadonlyArray<A>>>,
  ): string => Arr.map(LEVELS, (level) => `L${level} ${list(levels[`level${level}`])}`).join("; ");

  return [
    ...Arr.map(lords.cuspLords, (cusp): HouseFact => ({
      id: `kp.cusp.${cusp.house}`,
      house: Option.some(cusp.house),
      text: `KP cusp ${cusp.house} at ${cusp.dms} ${cusp.sign}, star ${cusp.star} pada ${cusp.pada}: sign lord ${cusp.signLord}, star lord ${cusp.starLord}, sub lord ${cusp.subLord}, sub-sub lord ${cusp.subSubLord}`,
    })),
    ...Arr.map(HOUSES, (house): HouseFact => ({
      id: `kp.significators.${house}`,
      house: Option.some(house),
      text: `KP significators of house ${house} (L1 strongest): ${levelsOf(facts.houseSignificators[house])}`,
    })),
    ...pipe(
      lords.planetLords,
      Arr.filter((entry) => entry.name !== "Lagna"),
      Arr.map((entry): HouseFact => {
        const planet = entry.name as Planet;
        return {
          id: `kp.planet.${planet}`,
          house: Option.none(),
          text: `KP ${planet} in house ${entry.house} at ${entry.dms} ${entry.sign}, star ${entry.star} pada ${entry.pada}: star lord ${entry.starLord}, sub lord ${entry.subLord}, sub-sub lord ${entry.subSubLord}; signifies houses ${levelsOf(facts.planetSignifications[planet])}; ${hasTenants(planet) ? "has planets in its stars" : "has no planet in its stars"}`,
        };
      }),
    ),
  ];
}

export function parashariChartFacts(chart: Chart.Chart): ReadonlyArray<HouseFact> {
  const placed = placedIn(chart);
  const sun = Arr.findFirst(placed, (entry) => entry.planet.name === "Sun");
  const aspecting = (house: House): ReadonlyArray<string> =>
    pipe(
      placed,
      Arr.filter((entry) => Arr.contains(aspectedHouses(entry.planet.name, entry.house), house)),
      Arr.map((entry) => entry.planet.name),
    );
  const owned = (planet: Planet): ReadonlyArray<House> =>
    Arr.filter(HOUSES, (house) => chart.houses[house].signLord === planet);

  return [
    ...Arr.map(HOUSES, (house): HouseFact => {
      const data = chart.houses[house];
      const lordPlace = Arr.findFirst(placed, (entry) => entry.planet.name === data.signLord);
      return {
        id: `par.house.${house}`,
        house: Option.some(house),
        text: `Parashari house ${house} is ${data.sign}; lord ${data.signLord}${Option.match(
          lordPlace,
          {
            onNone: () => "",
            onSome: (entry) => ` sits in house ${entry.house}`,
          },
        )}; occupants ${list(Arr.map(data.planets, (planet) => planet.name))}; aspected by ${list(aspecting(house))}`,
      };
    }),
    ...Arr.map(placed, ({ planet, house }): HouseFact => {
      const together = pipe(
        placed,
        Arr.filter((other) => other.house === house && other.planet.name !== planet.name),
        Arr.map((other) => other.planet.name),
      );
      const fromSun = Option.match(sun, {
        onNone: () => "",
        onSome: (entry) =>
          planet.name === "Sun"
            ? ""
            : `; ${separation(planet.longitude, entry.planet.longitude)} degrees from the Sun`,
      });
      return {
        id: `par.planet.${planet.name}`,
        house: Option.none(),
        text: `Parashari ${planet.name} in house ${house}, ${planet.sign.name} ${Math.round(planet.degree * 10) / 10} degrees, star ${starNameOf(planet.longitude)} pada ${padaOf(planet.longitude)} (star lord ${starLordOf(planet.longitude)}); dignity ${list(planet.in_sign)}; ${planet.is_retrograde ? "retrograde" : "direct"}; owns houses ${list(owned(planet.name))}; with ${list(together)}; aspects houses ${list(aspectedHouses(planet.name, house))}; aspected by ${list(Arr.filter(aspecting(house), (name) => name !== planet.name))}${fromSun}`,
      };
    }),
  ];
}

export function vargaFacts(
  division: number,
  varga: Chart.Chart,
  rashi: Chart.Chart,
): ReadonlyArray<HouseFact> {
  const signInRashi = (planet: Planet): Option.Option<string> =>
    pipe(
      placedIn(rashi),
      Arr.findFirst((entry) => entry.planet.name === planet),
      Option.map((entry) => entry.planet.sign.name),
    );
  return [
    {
      id: `d${division}.lagna`,
      house: Option.none(),
      text: `D${division} lagna is ${varga.houses[1].sign}, lord ${varga.houses[1].signLord}`,
    },
    ...Arr.map(placedIn(varga), ({ planet, house }): HouseFact => ({
      id: `d${division}.planet.${planet.name}`,
      house: Option.none(),
      text: `D${division} ${planet.name} in house ${house}, ${planet.sign.name}; dignity ${list(planet.in_sign)}${Option.exists(signInRashi(planet.name), (sign) => sign === planet.sign.name) ? "; same sign as in the birth chart" : ""}`,
    })),
  ];
}

export const strictRuleFact = (facts: KpFacts, event: KpEvent): HouseFact => {
  const group = houseGroup(event);
  const promise = judgePromise(facts, event, group);
  return {
    id: `kp.rule.${event.id}`,
    house: Option.none(),
    text: `Strict KP promise rule for "${event.label}" (conducive houses ${list(group.conducive)}, extra houses in the guidebook ${list(group.parenthesised)}, detrimental houses ${list(group.detrimental)}): sub lord ${promise.subLord} of cusp ${promise.cusp} gives ${promise.verdict}${promise.verdict === "mixed" ? `, leaning ${promise.lean}` : ""}. This is one rule read alone, not a conclusion`,
  };
};

export const memoryFacts = (
  memory: Pick<Memory, "events" | "notes">,
  periodRunningAt: (moment: DateTime.Utc) => string,
): ReadonlyArray<HouseFact> => [
  ...Arr.map(memory.events, (entry) => ({
    id: `memory.${entry.line}`,
    house: Option.none(),
    text: `Recorded on ${entry.date}: ${entry.event.label}. ${entry.message}. Period running then: ${periodRunningAt(entry.noonUtc)}`,
  })),
  ...Arr.map(memory.notes, (entry) => ({
    id: `memory.${entry.line}`,
    house: Option.none(),
    text: `Recorded on ${entry.date}: ${entry.message}. Period running then: ${periodRunningAt(entry.noonUtc)}`,
  })),
];

export const antaraRunningAt = (
  timeline: Timeline,
  calendar: Calendar,
  moment: DateTime.Utc,
  birth: DateTime.Utc,
) =>
  pipe(
    runningPeriods(timeline, calendar, moment, birth),
    Arr.findFirst((row) =>
      Option.exists(parsePeriodId(row.id), (parsed) => parsed.lords.length === ANTARA_LORDS),
    ),
    Option.match({ onNone: () => "unknown", onSome: (row) => row.id }),
  );

export interface JaiminiSource {
  readonly karakas: ReadonlyArray<{
    readonly role: string;
    readonly planets: ReadonlyArray<string>;
  }>;
  readonly karakamsha: ReadonlyArray<{ readonly planet: string; readonly sign: string }>;
}

export const jaiminiFacts = (source: JaiminiSource): ReadonlyArray<HouseFact> => [
  ...Arr.map(source.karakas, (karaka) => ({
    id: `jaimini.karaka.${karaka.role}`,
    house: Option.none(),
    text: `Jaimini ${karaka.role} is ${list(karaka.planets)}`,
  })),
  ...Arr.map(source.karakamsha, (entry) => ({
    id: `jaimini.karakamsha.${entry.planet}`,
    house: Option.none(),
    text: `Jaimini karakamsha: ${entry.planet} falls in ${entry.sign} in the D9`,
  })),
];

export const forHouses = (
  facts: ReadonlyArray<HouseFact>,
  houses: ReadonlyArray<House>,
): ReadonlyArray<Fact> =>
  pipe(
    facts,
    Arr.filter(
      (fact) =>
        houses.length === 0 ||
        Option.match(fact.house, {
          onNone: () => true,
          onSome: (house) => Arr.contains(houses, house),
        }),
    ),
    Arr.map(({ id, text }) => ({ id, text })),
  );

const DEPTH_LORDS: Readonly<Record<Depth, number>> = {
  dasha: 1,
  bhukti: 2,
  antara: 3,
  sookshma: 4,
};

function spansAt(timeline: Timeline, lordCount: number): ReadonlyArray<LordedSpan> {
  if (lordCount === 1) {
    return Arr.map(timeline, (dasha) => ({
      lords: [dasha.mahadasha],
      start: dasha.start,
      end: dasha.end,
    }));
  }
  const bhuktis = Arr.flatMap(timeline, (dasha) => dasha.antardashas);
  if (lordCount === 2) {
    return Arr.map(bhuktis, (bhukti) => ({
      lords: [bhukti.mahadasha, bhukti.antardasha],
      start: bhukti.start,
      end: bhukti.end,
    }));
  }
  const antaras = Arr.flatMap(bhuktis, (bhukti) => Dasha.pratyantardashas(bhukti));
  if (lordCount === 3) {
    return Arr.map(antaras, (antara) => ({
      lords: [antara.mahadasha, antara.antardasha, antara.pratyantardasha],
      start: antara.start,
      end: antara.end,
    }));
  }
  return pipe(
    antaras,
    Arr.flatMap((antara) => Dasha.sookshmas(antara)),
    Arr.map((sookshma) => ({
      lords: [sookshma.mahadasha, sookshma.antardasha, sookshma.pratyantardasha, sookshma.sookshma],
      start: sookshma.start,
      end: sookshma.end,
    })),
  );
}

export const Calendar = Schema.Literals(["kp", "par"]);
export type Calendar = typeof Calendar.Type;

export const CALENDAR_SEPARATOR = ":";

export type Timelines = Readonly<Record<Calendar, Timeline>>;

const idOf = (calendar: Calendar, lords: ReadonlyArray<Planet>): string =>
  `${calendar}${CALENDAR_SEPARATOR}${lords.join(PERIOD_ID_SEPARATOR)}`;

export const parsePeriodId = (
  id: string,
): Option.Option<{ readonly calendar: Calendar; readonly lords: ReadonlyArray<string> }> => {
  const [prefix, lords, ...rest] = id.split(CALENDAR_SEPARATOR);
  return rest.length > 0 || lords === undefined
    ? Option.none()
    : Option.map(
        Arr.findFirst(Calendar.literals, (calendar) => calendar === prefix),
        (calendar) => ({ calendar, lords: lords.split(PERIOD_ID_SEPARATOR) }),
      );
};

export function periodRows(
  timeline: Timeline,
  calendar: Calendar,
  depth: Depth,
  window: Span,
  birth: DateTime.Utc,
): ReadonlyArray<PeriodRow> {
  return pipe(
    spansAt(timeline, DEPTH_LORDS[depth]),
    Arr.filter(
      (span) =>
        DateTime.isGreaterThan(span.end, window.start) &&
        DateTime.isLessThan(span.start, window.end) &&
        DateTime.isGreaterThan(span.end, birth),
    ),
    Arr.map((span): PeriodRow => ({
      id: idOf(calendar, span.lords),
      start: span.start,
      end: span.end,
      ageAtStart:
        Math.round(
          (Math.max(0, DateTime.toEpochMillis(span.start) - DateTime.toEpochMillis(birth)) /
            YEAR_MS) *
            10,
        ) / 10,
    })),
  );
}

export function runningPeriods(
  timeline: Timeline,
  calendar: Calendar,
  at: DateTime.Utc,
  birth: DateTime.Utc,
): ReadonlyArray<PeriodRow> {
  const instant = { start: at, end: DateTime.add(at, { minutes: 1 }) };
  return Arr.flatMap(Depth.literals, (depth) =>
    periodRows(timeline, calendar, depth, instant, birth),
  );
}

export function resolvePeriod(
  timelines: Timelines,
  id: string,
  birth: DateTime.Utc,
): Option.Option<Span> {
  return Option.flatMap(parsePeriodId(id), ({ calendar, lords }) =>
    lords.length < 1 || lords.length > 4
      ? Option.none()
      : pipe(
          spansAt(timelines[calendar], lords.length),
          Arr.findFirst(
            (span) => idOf(calendar, span.lords) === id && DateTime.isGreaterThan(span.end, birth),
          ),
          Option.map(({ start, end }) => ({ start, end })),
        ),
  );
}

export const ShortlistRow = Schema.Struct({
  id: Schema.String,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
  ageAtStart: Schema.Finite,
  linkedLords: Schema.String,
});
export interface ShortlistRow extends Schema.Schema.Type<typeof ShortlistRow> {}

export const ShortlistBlock = Schema.Struct({
  id: Schema.String,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
  rows: Schema.Array(ShortlistRow),
});
export interface ShortlistBlock extends Schema.Schema.Type<typeof ShortlistBlock> {}

const MAX_BHUKTI_BLOCKS = 8;
const MIN_BLOCK_OVERLAP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const overlapDays = (left: Span, right: Span): number =>
  (Math.min(DateTime.toEpochMillis(left.end), DateTime.toEpochMillis(right.end)) -
    Math.max(DateTime.toEpochMillis(left.start), DateTime.toEpochMillis(right.start))) /
  DAY_MS;

export function coverageBlocks(
  timeline: Timeline,
  calendar: Calendar,
  window: Span,
  birth: DateTime.Utc,
): { readonly unit: Depth; readonly within: Depth; readonly blocks: ReadonlyArray<PeriodRow> } {
  const blocksAt = (depth: Depth) =>
    Arr.filter(
      periodRows(timeline, calendar, depth, window, birth),
      (row) => overlapDays(row, window) >= MIN_BLOCK_OVERLAP_DAYS,
    );
  const bhuktis = blocksAt("bhukti");
  return bhuktis.length <= MAX_BHUKTI_BLOCKS
    ? { unit: "bhukti", within: "antara", blocks: bhuktis }
    : { unit: "dasha", within: "bhukti", blocks: blocksAt("dasha") };
}

export function linkedLords(
  lords: ReadonlyArray<string>,
  calendar: Calendar,
  facts: KpFacts,
  rashi: Chart.Chart,
  houses: ReadonlyArray<House>,
): ReadonlyArray<string> {
  const touches = (planet: Planet): boolean => {
    if (houses.length === 0) return true;
    if (calendar === "kp") {
      return Arr.some(LEVELS, (level) =>
        Arr.some(facts.planetSignifications[planet][`level${level}`], (house) =>
          Arr.contains(houses, house),
        ),
      );
    }
    const place = Arr.findFirst(placedIn(rashi), (entry) => entry.planet.name === planet);
    return (
      Arr.some(houses, (house) => rashi.houses[house].signLord === planet) ||
      Option.exists(
        place,
        (entry) =>
          Arr.contains(houses, entry.house) ||
          Arr.some(aspectedHouses(planet, entry.house), (house) => Arr.contains(houses, house)),
      )
    );
  };
  return pipe(
    Arr.dedupe(lords),
    Arr.filter((name) =>
      Option.exists(
        Arr.findFirst(PLANETS, (planet) => planet === name),
        touches,
      ),
    ),
  );
}

export function shortlist(
  timeline: Timeline,
  calendar: Calendar,
  window: Span,
  birth: DateTime.Utc,
  facts: KpFacts,
  rashi: Chart.Chart,
  houses: ReadonlyArray<House>,
): { readonly unit: Depth; readonly blocks: ReadonlyArray<ShortlistBlock> } {
  const { unit, within, blocks } = coverageBlocks(timeline, calendar, window, birth);
  return {
    unit,
    blocks: Arr.map(blocks, (block) => ({
      id: block.id,
      start: block.start,
      end: block.end,
      rows: pipe(
        periodRows(timeline, calendar, within, block, birth),
        Arr.filter((row) => overlapDays(row, window) > 0),
        Arr.map((row) => ({
          ...row,
          linkedLords: list(
            linkedLords(
              Option.match(parsePeriodId(row.id), { onNone: () => [], onSome: (id) => id.lords }),
              calendar,
              facts,
              rashi,
              houses,
            ),
          ),
        })),
      ),
    })),
  };
}

export const CandidateRow = Schema.Struct({
  id: Schema.String,
  start: Schema.DateTimeUtcFromString,
  end: Schema.DateTimeUtcFromString,
  ageAtStart: Schema.Finite,
  lords: Schema.Array(Schema.String),
  sameDatesInOtherCalendar: Schema.Array(Schema.String),
  record: Schema.Array(Schema.String),
  transits: Schema.Array(Fact),
});
export interface CandidateRow extends Schema.Schema.Type<typeof CandidateRow> {}

export function lordProfile(
  planet: Planet,
  calendar: Calendar,
  facts: KpFacts,
  rashi: Chart.Chart,
  houses: ReadonlyArray<House>,
): string {
  if (calendar === "kp") {
    const signified = Arr.flatMap(LEVELS, (level) =>
      pipe(
        facts.planetSignifications[planet][`level${level}`],
        Arr.filter((house) => houses.length === 0 || Arr.contains(houses, house)),
        Arr.map((house) => `${house} (L${level})`),
      ),
    );
    return `${planet} (KP): signifies ${houses.length === 0 ? "houses" : "of the houses asked"} ${list(signified)}; star lord ${facts.planetStarLords[planet]}, sub lord ${facts.planetSubLords[planet]}`;
  }
  const place = Arr.findFirst(placedIn(rashi), (entry) => entry.planet.name === planet);
  const owned = Arr.filter(HOUSES, (house) => rashi.houses[house].signLord === planet);
  return `${planet} (Parashari): owns ${list(owned)}${Option.match(place, {
    onNone: () => "",
    onSome: (entry) =>
      `, sits in ${entry.house}, dignity ${list(entry.planet.in_sign)}, aspects ${list(aspectedHouses(planet, entry.house))}`,
  })}`;
}

export function sharedWithRecord(
  lords: ReadonlyArray<string>,
  memory: Pick<Memory, "events" | "notes">,
  periodRunningAt: (moment: DateTime.Utc) => string,
): ReadonlyArray<string> {
  const entries = [
    ...Arr.map(memory.events, (entry) => ({
      line: entry.line,
      date: entry.date,
      noonUtc: entry.noonUtc,
      what: entry.event.label,
    })),
    ...Arr.map(memory.notes, (entry) => ({
      line: entry.line,
      date: entry.date,
      noonUtc: entry.noonUtc,
      what: entry.message,
    })),
  ];
  return Arr.map(entries, (entry) => {
    const running = periodRunningAt(entry.noonUtc);
    const runningLords = Option.match(parsePeriodId(running), {
      onNone: () => [],
      onSome: (parsed) => parsed.lords,
    });
    const shared = Arr.dedupe(Arr.intersection(lords, runningLords));
    return `memory.${entry.line} (${entry.date}: ${entry.what}) ran under ${running}; lords in common: ${list(shared)}`;
  });
}

export const SLOW_PLANETS = ["Jupiter", "Saturn", "Rahu"] as const satisfies ReadonlyArray<Planet>;
export type SlowPlanet = (typeof SLOW_PLANETS)[number];

export interface SignSample {
  readonly at: DateTime.Utc;
  readonly sign: Chart.Rashis;
  readonly kpHouse: number;
}

const onCircle = (degrees: number): number => ((degrees % 360) + 360) % 360;

export const kpHouseOf = (longitude: number, cuspsInHouseOrder: ReadonlyArray<number>): number =>
  pipe(
    Arr.findFirstIndex(cuspsInHouseOrder, (cusp, index) => {
      const next = cuspsInHouseOrder[(index + 1) % cuspsInHouseOrder.length] ?? cusp;
      return onCircle(longitude - cusp) < onCircle(next - cusp);
    }),
    Option.match({ onNone: () => 1, onSome: (index) => index + 1 }),
  );

const SIGNS: ReadonlyArray<Chart.Rashis> = Chart.Rashis.literals;

export const signOf = (longitude: number): Chart.Rashis =>
  SIGNS[Math.floor((((longitude % 360) + 360) % 360) / 30)] ?? "Aries";

const houseFrom = (reference: Chart.Rashis, sign: Chart.Rashis): number =>
  ((SIGNS.indexOf(sign) - SIGNS.indexOf(reference) + SIGNS.length) % SIGNS.length) + 1;

export const transitFactId = (planet: Planet, sign: Chart.Rashis, entered: DateTime.Utc): string =>
  `transit.${planet}.${sign}.${DateTime.formatIsoDateUtc(entered)}`;

export function transitFacts(
  planet: SlowPlanet,
  samplesInTimeOrder: ReadonlyArray<SignSample>,
  lagnaSign: Chart.Rashis,
  moonSign: Chart.Rashis,
): ReadonlyArray<Fact> {
  const stays = Arr.reduce(
    samplesInTimeOrder,
    [] as ReadonlyArray<{
      readonly sign: Chart.Rashis;
      readonly from: DateTime.Utc;
      readonly to: DateTime.Utc;
      readonly kpHouseAtStart: number;
      readonly kpHouseAtEnd: number;
    }>,
    (staysSoFar, sample) =>
      pipe(
        Arr.last(staysSoFar),
        Option.filter((stay) => stay.sign === sample.sign),
        Option.match({
          onNone: () => [
            ...staysSoFar,
            {
              sign: sample.sign,
              from: sample.at,
              to: sample.at,
              kpHouseAtStart: sample.kpHouse,
              kpHouseAtEnd: sample.kpHouse,
            },
          ],
          onSome: (stay) => [
            ...Arr.dropRight(staysSoFar, 1),
            { ...stay, to: sample.at, kpHouseAtEnd: sample.kpHouse },
          ],
        }),
      ),
  );
  return Arr.map(stays, (stay) => ({
    id: transitFactId(planet, stay.sign, stay.from),
    text: `Transit ${planet} in ${stay.sign} from about ${DateTime.formatIsoDateUtc(stay.from)} to about ${DateTime.formatIsoDateUtc(stay.to)}. Parashari (whole-sign houses): house ${houseFrom(lagnaSign, stay.sign)} from the lagna, house ${houseFrom(moonSign, stay.sign)} from the Moon. KP (Placidus cusps): house ${stay.kpHouseAtStart}${stay.kpHouseAtEnd === stay.kpHouseAtStart ? " throughout" : ` at the start, house ${stay.kpHouseAtEnd} at the end`}`,
  }));
}

export const parseTransitFactId = (
  id: string,
): Option.Option<{
  readonly planet: SlowPlanet;
  readonly sign: Chart.Rashis;
  readonly at: DateTime.Utc;
}> => {
  const [prefix, planet, sign, date] = id.split(".");
  return prefix !== "transit"
    ? Option.none()
    : Option.all({
        planet: Arr.findFirst(SLOW_PLANETS, (slow) => slow === planet),
        sign: Arr.findFirst(SIGNS, (known) => known === sign),
        at: DateTime.make(`${date ?? ""}T23:59:59Z`),
      });
};
