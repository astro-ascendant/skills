import { Chart, Transit } from "astro-ascendant";
import { Schema } from "effect";

import { Latitude, Longitude, OffsetMoment, PersonName, Sex } from "./contract.ts";

export const AddPersonInput = Schema.Struct({
  name: PersonName.pipe(
    Schema.annotate({ description: "Person name used for the saved record directory" }),
  ),
  moment: OffsetMoment.pipe(
    Schema.annotate({
      description: "Birth moment in ISO 8601 form with Z or an explicit UTC offset",
    }),
  ),
  latitude: Latitude.pipe(Schema.annotate({ description: "Birth latitude" })),
  longitude: Longitude.pipe(Schema.annotate({ description: "Birth longitude" })),
  sex: Schema.optional(Sex.pipe(Schema.annotate({ description: "Birth sex: Male or Female" }))),
});
export type AddPersonInput = typeof AddPersonInput.Type;

export const CheckTransitInput = Schema.Struct({
  name: PersonName.pipe(Schema.annotate({ description: "Name of a saved person record" })),
  moment: OffsetMoment.pipe(
    Schema.annotate({
      description: "Transit moment in ISO 8601 form with Z or an explicit UTC offset",
    }),
  ),
  planet: Chart.Planets.pipe(
    Schema.annotate({
      description:
        "Transiting graha: Sun, Moon, Mars, Mercury, Venus, Jupiter, Saturn, Rahu, or Ketu",
    }),
  ),
  school: Schema.optional(
    Schema.Literals(["kp", "parashari"]).pipe(
      Schema.annotate({ description: "Calculation school (default parashari)" }),
    ),
  ),
  direction: Schema.optional(
    Transit.TransitDirection.pipe(
      Schema.annotate({ description: "Search direction (default forward)" }),
    ),
  ),
  kinds: Schema.optional(
    Schema.Array(Transit.TransitKind).pipe(
      Schema.annotate({ description: "Transit kinds (default sign-ingress)" }),
    ),
  ),
  count: Schema.optional(
    Schema.Finite.pipe(
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
      Schema.annotate({ description: "Number of events from 1 to 100 (default 5)" }),
    ),
  ),
  targetLongitude: Schema.optional(
    Schema.Finite.pipe(
      Schema.check(Schema.isBetween({ minimum: 0, maximum: 360 })),
      Schema.annotate({
        description: "Required for longitude-hit: sidereal longitude from 0 to 360",
      }),
    ),
  ),
  house: Schema.optional(
    Chart.Houses.pipe(
      Schema.annotate({ description: "Required for cusp-crossing: natal house from 1 to 12" }),
    ),
  ),
  maxYears: Schema.optional(
    Schema.Finite.pipe(Schema.annotate({ description: "Search window in years (default 30)" })),
  ),
  precisionMinutes: Schema.optional(
    Schema.Finite.pipe(
      Schema.annotate({ description: "Refinement precision in minutes (default 1)" }),
    ),
  ),
  summary: Schema.optional(
    Schema.Boolean.pipe(
      Schema.annotate({
        description: "Leave out the chart attached to each event (default false)",
      }),
    ),
  ),
});
export type CheckTransitInput = typeof CheckTransitInput.Type;

export const RulingPlanetsInput = Schema.Struct({
  moment: OffsetMoment.pipe(
    Schema.annotate({
      description: "Judgment moment in ISO 8601 form with Z or an explicit UTC offset",
    }),
  ),
  name: Schema.optional(
    PersonName.pipe(
      Schema.annotate({
        description:
          "Saved person name; their birthplace is used when latitude and longitude are absent",
      }),
    ),
  ),
  latitude: Schema.optional(
    Latitude.pipe(Schema.annotate({ description: "Latitude (required without name)" })),
  ),
  longitude: Schema.optional(
    Longitude.pipe(Schema.annotate({ description: "Longitude (required without name)" })),
  ),
});
export type RulingPlanetsInput = typeof RulingPlanetsInput.Type;

/**
 * Name, description and parameters of every tool. Plain `effect` only, so the
 * OpenCode plugin can use it; `toolkit.ts` wraps the same specs for `effect/ai`.
 */
export const toolSpecs = {
  addPerson: {
    name: "ascendant_add_person",
    description: "Create or refresh one saved astrology record from exact birth data.",
    parameters: AddPersonInput,
  },
  checkTransit: {
    name: "ascendant_check_transit",
    description: "Search transit events for one saved person and moment.",
    parameters: CheckTransitInput,
  },
  rulingPlanets: {
    name: "ascendant_ruling_planets",
    description: "Read KP ruling planets for a judgment moment and place.",
    parameters: RulingPlanetsInput,
  },
} as const;
