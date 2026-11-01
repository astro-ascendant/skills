import { Chart, Transit } from "astro-ascendant";
import { DateTime, Effect, Schema } from "effect";

import {
  calculationContext,
  decodeMoment,
  KpAstroParams,
  makeLocatedMoment,
  type OffsetMoment,
  type PersonName,
  readStoredPerson,
  VedicAstroParams,
} from "./common.ts";

export type TransitSchool = "KP" | "Parashari";

export interface TransitSearchOptions {
  readonly planet: Chart.Planets;
  readonly direction: Transit.TransitDirection;
  readonly kinds: readonly [Transit.TransitKind, ...Transit.TransitKind[]];
  readonly count: number;
  readonly targetLongitude?: number;
  readonly house?: Chart.Houses;
  readonly maxYears?: number;
  readonly precisionMinutes?: number;
  readonly school?: TransitSchool;
  /** Leave out the chart attached to each event. */
  readonly summary?: boolean;
}

/** An event for a crossing of a natal house cusp, found as a hit on that cusp. */
interface NatalCuspLabel {
  readonly house: Chart.Houses;
}

function formatEvent(event: Transit.TransitEvent, summary: boolean, label?: NatalCuspLabel) {
  return {
    planet: event.planet,
    moment: DateTime.formatIso(event.moment),
    longitude: Number(event.longitude.toFixed(2)),
    kind: label === undefined ? event.kind : "cusp-crossing",
    ...(label !== undefined ? { house: label.house } : {}),
    ...(event.sign !== undefined ? { sign: event.sign } : {}),
    retrograde: event.is_retrograde,
    direction: event.direction,
    provenance: { ...event.provenance },
    ...(!summary && event.calculation !== undefined
      ? {
          chart: Schema.encodeSync(Chart.ChartCalculation)(event.calculation),
        }
      : {}),
  };
}

export const searchTransits = Effect.fn("Ascendant.searchTransits")(function* (
  name: PersonName,
  moment: OffsetMoment,
  options: TransitSearchOptions,
) {
  const person = yield* readStoredPerson(name);
  const fromDate = yield* decodeMoment(moment);
  const from = makeLocatedMoment(fromDate, person.latitude, person.longitude);
  const summary = options.summary === true;
  const search = {
    planet: options.planet,
    from,
    count: options.count,
    direction: options.direction,
    ...(options.maxYears !== undefined ? { maxYears: options.maxYears } : {}),
    ...(options.precisionMinutes !== undefined
      ? { precisionMinutes: options.precisionMinutes }
      : {}),
    includeCharts: summary ? [] : ([1] as const),
  };

  // The library places `cusp-crossing` on the cusps of the chart at `from`,
  // which is the search start, not the birth. A natal house crossing is a hit
  // on the cusp of the saved person's birth chart, so search it that way.
  const natalHouse = options.kinds.includes("cusp-crossing") ? options.house : undefined;
  const otherKinds = options.kinds.filter(
    (kind) => !(kind === "cusp-crossing" && natalHouse !== undefined),
  );

  const natalEvents =
    natalHouse === undefined
      ? []
      : yield* Effect.gen(function* () {
          const birth = makeLocatedMoment(
            yield* decodeMoment(person.moment),
            person.latitude,
            person.longitude,
          );
          const natal = yield* Chart.generate(birth, []);
          const cusp = natal.charts[0]?.houses[natalHouse].cusp;
          if (cusp === undefined) {
            return yield* Effect.die(new Error("Natal chart returned no cusp for the house"));
          }
          const hits = yield* Transit.findTransits({
            ...search,
            kinds: ["longitude-hit"],
            targetLongitude: cusp as Chart.Longitude,
          });
          return hits.map((event) => ({ event, label: { house: natalHouse } }));
        });

  const [firstOther, ...restOther] = otherKinds;
  const otherEvents =
    firstOther === undefined
      ? []
      : (yield* Transit.findTransits({
          ...search,
          kinds: [firstOther, ...restOther],
          ...(options.targetLongitude !== undefined
            ? { targetLongitude: options.targetLongitude as Chart.Longitude }
            : {}),
          ...(natalHouse === undefined && options.house !== undefined
            ? { house: options.house }
            : {}),
        })).map((event) => ({ event, label: undefined }));

  const sign = options.direction === "backward" ? -1 : 1;
  const events = [...natalEvents, ...otherEvents]
    .sort(
      (a, b) =>
        sign * (DateTime.toEpochMillis(a.event.moment) - DateTime.toEpochMillis(b.event.moment)),
    )
    .slice(0, options.count);

  return {
    from: DateTime.formatIso(fromDate),
    calculation: calculationContext(
      options.school ?? "Parashari",
      options.school === "KP" ? KpAstroParams : VedicAstroParams,
    ),
    events: events.map(({ event, label }) => formatEvent(event, summary, label)),
  };
});
