import { Chart, Dasha } from "astro-ascendant";
import { DateTime, Effect } from "effect";

import { calculationContext, decodeMoment, KpAstroParams, readStoredPerson } from "./common.ts";
import { EXCLUDED_KP_EVENTS, findKpEvent, KP_EVENTS, type House } from "./events.ts";
import {
  judgeKp,
  KP_HOUSES,
  KP_PLANETS,
  type KpFacts,
  type KpPeriod,
  type Planet,
} from "./kp-judge.ts";
import { kpCuspAndPlanetLords } from "./kp-lords.ts";
import { rulingPlanetsWorkflow } from "./ruling-planets.ts";
import type { JudgeInput } from "./tool-specs.ts";

const DEFAULT_YEARS = 10;
const DEFAULT_LIMIT = 5;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const iso = (epochMillis: number): string => new Date(epochMillis).toISOString();

/** Reads the facts the KP rules need from one KP D1. */
export const kpFactsOf = Effect.fn("Ascendant.kpFactsOf")(function* (chart: Chart.D1Chart) {
  const lords = kpCuspAndPlanetLords(chart);
  const cuspSubLords = new Map<House, Planet>(
    lords.cuspLords.map((cusp) => [cusp.house, cusp.subLord]),
  );
  const planetStarLords = new Map<string, Planet>(
    lords.planetLords.map((planet) => [planet.name, planet.starLord]),
  );
  const planetSubLords = new Map<string, Planet>(
    lords.planetLords.map((planet) => [planet.name, planet.subLord]),
  );
  const complete =
    KP_HOUSES.every((house) => cuspSubLords.has(house)) &&
    KP_PLANETS.every((planet) => planetStarLords.has(planet) && planetSubLords.has(planet));
  if (
    !complete ||
    chart.planetSignifications === undefined ||
    chart.houseSignificators === undefined
  ) {
    return yield* Effect.fail(new Error("KP chart is missing cusps, planets or significators"));
  }
  return {
    cuspSubLords: Object.fromEntries(cuspSubLords) as Record<House, Planet>,
    planetStarLords: Object.fromEntries(planetStarLords) as Record<Planet, Planet>,
    planetSubLords: Object.fromEntries(planetSubLords) as Record<Planet, Planet>,
    planetSignifications: chart.planetSignifications,
    houseSignificators: chart.houseSignificators,
  } satisfies KpFacts;
});

/** The KP judgment for one saved person, one event and one time window. */
export const judgeWorkflow = Effect.fn("Ascendant.judge")(function* (input: JudgeInput) {
  const event = findKpEvent(input.event);
  if (event === undefined) {
    return yield* Effect.fail(new Error(`Unknown event ${input.event}`));
  }
  const person = yield* readStoredPerson(input.name);
  const birthMoment = Chart.Moment.make({ date: yield* decodeMoment(person.moment) });
  const calculation = yield* Chart.generate(
    {
      moment: birthMoment,
      latitude: person.latitude,
      longitude: person.longitude,
      ...(person.sex !== undefined ? { sex: person.sex } : {}),
    },
    [],
  );
  const d1 = calculation.charts[0];
  if (d1 === undefined) {
    return yield* Effect.fail(new Error("KP chart generation returned no D1"));
  }
  const facts = yield* kpFactsOf(d1);
  const timeline = yield* Dasha.calculate(birthMoment, calculation.placements);

  const from = DateTime.toEpochMillis(yield* decodeMoment(input.from));
  const to = from + (input.years ?? DEFAULT_YEARS) * YEAR_MS;
  const overlaps = (period: { readonly start: DateTime.Utc; readonly end: DateTime.Utc }) =>
    DateTime.toEpochMillis(period.end) > from && DateTime.toEpochMillis(period.start) < to;
  const periods: ReadonlyArray<KpPeriod> = timeline
    .filter(overlaps)
    .flatMap((mahadasha) => mahadasha.antardashas.filter(overlaps))
    .flatMap((antardasha) => Dasha.pratyantardashas(antardasha).filter(overlaps))
    .map((antara) => ({
      dasha: antara.mahadasha,
      bhukti: antara.antardasha,
      antara: antara.pratyantardasha,
      start: DateTime.toEpochMillis(antara.start),
      end: DateTime.toEpochMillis(antara.end),
    }));

  const ruling =
    input.judgmentMoment === undefined
      ? undefined
      : yield* rulingPlanetsWorkflow(input.judgmentMoment, person.latitude, person.longitude);
  const rulingPlanets =
    ruling === undefined ? undefined : [...new Set<Planet>(ruling.rulingPlanets ?? [])];

  const judgment = judgeKp(facts, event, periods, {
    from,
    to,
    limit: input.limit ?? DEFAULT_LIMIT,
    ...(rulingPlanets !== undefined ? { rulingPlanets } : {}),
  });

  return {
    person: { name: person.name },
    calculation: calculationContext("KP", KpAstroParams),
    window: { from: iso(from), to: iso(to) },
    ...(ruling !== undefined && rulingPlanets !== undefined
      ? { rulingPlanets: { moment: ruling.moment, planets: rulingPlanets } }
      : {}),
    ...judgment,
    timing: {
      ...judgment.timing,
      windows: judgment.timing.windows.map((window) => ({
        ...window,
        start: iso(window.start),
        end: iso(window.end),
      })),
    },
  };
});

/** Events the judge accepts, and the guidebook rows it refuses with the reason. */
export const listEvents = () => ({
  events: KP_EVENTS.map(({ id, label, primary, supporting, optional }) => ({
    id,
    label,
    primary,
    supporting: supporting.join(","),
    optional: optional.join(",") || "-",
  })),
  refused: EXCLUDED_KP_EVENTS.map(({ label, primary, reason }) => ({ label, primary, reason })),
});
