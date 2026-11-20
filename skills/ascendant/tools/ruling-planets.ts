import { Chart } from "astro-ascendant";
import { Array as Arr, DateTime, Effect, Option, pipe } from "effect";

import {
  calculationContext,
  ChartIncomplete,
  decodeMoment,
  KpAstroParams,
  type Latitude,
  type Longitude,
  type OffsetMoment,
} from "./common.ts";
import { kpLordChain } from "./kp-lords.ts";

export const rulingPlanetsWorkflow = Effect.fn("Ascendant.rulingPlanets")(function* (
  moment: OffsetMoment,
  latitude: Latitude,
  longitude: Longitude,
) {
  const date = yield* decodeMoment(moment);
  const chartParams = {
    moment: Chart.Moment.make({ date }),
    latitude,
    longitude,
  };
  const calculation = yield* Chart.generate(chartParams, []);
  const present = <A>(value: Option.Option<A>, missing: string) =>
    Option.match(value, {
      onNone: () =>
        Effect.fail(new ChartIncomplete({ message: `KP chart generation returned no ${missing}` })),
      onSome: Effect.succeed,
    });
  const d1 = yield* present(Option.fromUndefinedOr(calculation.charts[0]), "D1");
  const lagnaLongitude = yield* present(
    Option.fromNullishOr(d1.houses[1].lagna?.longitude),
    "Lagna",
  );
  const moonEntry = yield* present(
    pipe(
      Object.values(d1.houses),
      Arr.flatMap((house) => house.planets),
      Arr.findFirst((planet) => planet.name === "Moon"),
    ),
    "Moon",
  );
  return {
    moment: DateTime.formatIso(date),
    latitude,
    longitude,
    calculation: calculationContext("KP", KpAstroParams),
    rulingPlanets: d1.rulingPlanets,
    ascendant: {
      longitude: lagnaLongitude,
      ...kpLordChain(lagnaLongitude),
    },
    moon: {
      longitude: moonEntry.longitude,
      ...kpLordChain(moonEntry.longitude),
    },
    note: "Day lord follows the UTC weekday; Hindu sunrise-to-sunrise day reckoning (references/kp/birth-time-rectification.md) may differ for moments near sunrise.",
  };
});
