import { Chart, Transit } from "astro-ascendant";
import { Schema } from "effect";

import { KpEventId } from "./events.ts";
import { Depth } from "./evidence.ts";
import { Worksheet } from "./verify-answer.ts";
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

export const JudgeInput = Schema.Struct({
  name: PersonName.pipe(Schema.annotate({ description: "Name of a saved person record" })),
  event: KpEventId.pipe(
    Schema.annotate({
      description: "Event id from the KP house-group table (list them with `ascendant events`)",
    }),
  ),
  from: OffsetMoment.pipe(
    Schema.annotate({
      description: "Start of the timing window in ISO 8601 form with Z or an explicit UTC offset",
    }),
  ),
  years: Schema.optional(
    Schema.Finite.pipe(
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 60 })),
      Schema.annotate({ description: "Length of the timing window in years (default 10)" }),
    ),
  ),
  limit: Schema.optional(
    Schema.Finite.pipe(
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
      Schema.annotate({ description: "Most timing windows to return (default 5)" }),
    ),
  ),
  useMemory: Schema.optional(
    Schema.Boolean.pipe(
      Schema.annotate({
        description: "Use the tagged past events in the person's MEMORY.md (default true)",
      }),
    ),
  ),
  rectifyMinutes: Schema.optional(
    Schema.Finite.pipe(
      Schema.check(Schema.isBetween({ minimum: 0, maximum: 60 })),
      Schema.annotate({
        description:
          "Minutes either side of the recorded birth time to test against past events (default 15, 0 switches the check off)",
      }),
    ),
  ),
  judgmentMoment: Schema.optional(
    OffsetMoment.pipe(
      Schema.annotate({
        description:
          "Moment whose ruling planets select significators; leave out to judge without ruling planets",
      }),
    ),
  ),
});
export type JudgeInput = typeof JudgeInput.Type;

export const EvidenceInput = Schema.Struct({
  name: PersonName.pipe(Schema.annotate({ description: "Name of a saved person record" })),
  houses: Schema.optional(
    Schema.Array(Chart.Houses).pipe(
      Schema.annotate({
        description: "Houses the question turns on; leave out for all twelve",
      }),
    ),
  ),
  event: Schema.optional(
    KpEventId.pipe(
      Schema.annotate({
        description:
          "An event id from `ascendant events`: adds its guidebook house group and the strict KP promise rule as one fact",
      }),
    ),
  ),
  vargas: Schema.optional(
    Schema.Array(Chart.DivisionalDivision).pipe(
      Schema.annotate({ description: "Divisional charts to include (default 9 and 10)" }),
    ),
  ),
  from: Schema.optional(
    OffsetMoment.pipe(
      Schema.annotate({ description: "Start of the stretch of life to list periods for" }),
    ),
  ),
  to: Schema.optional(
    OffsetMoment.pipe(Schema.annotate({ description: "End of that stretch; give with from" })),
  ),
  at: Schema.optional(
    OffsetMoment.pipe(
      Schema.annotate({
        description:
          "A moment, usually now: adds the periods running then at every level and where Jupiter, Saturn and Rahu were",
      }),
    ),
  ),
  compare: Schema.optional(
    Schema.Array(Schema.String).pipe(
      Schema.annotate({
        description:
          "Period ids (kp:... or par:...) to lay side by side as candidates: for each, what every lord means in that period's own school, which periods of the other calendar cover the same dates, the slow transits during it, and the lords it shares with the recorded past events",
      }),
    ),
  ),
  depth: Schema.optional(
    Depth.pipe(
      Schema.annotate({
        description:
          "Period level to list: dasha, bhukti (default), antara or sookshma. Narrow the stretch before going deeper",
      }),
    ),
  ),
});
export type EvidenceInput = typeof EvidenceInput.Type;

export const VerifyInput = Schema.Struct({
  name: PersonName.pipe(Schema.annotate({ description: "Name of a saved person record" })),
  draft: Schema.String.pipe(
    Schema.annotate({ description: "The full draft answer, exactly as it would be shown" }),
  ),
  worksheet: Worksheet.pipe(
    Schema.annotate({
      description:
        "The reasoning behind the draft: one part per part of the question, with the fact ids for and against, the period ids chosen, the answer and its confidence",
    }),
  ),
});
export type VerifyInput = typeof VerifyInput.Type;

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
  judge: {
    name: "ascendant_judge",
    description:
      "Judge one event for a saved person by KP rules: promise, ranked significators and timing windows, checked against the tagged past events in MEMORY.md. Same input and memory, same judgment.",
    parameters: JudgeInput,
  },
  evidence: {
    name: "ascendant_evidence",
    description:
      "Chart facts for a saved person, each with an id: KP cusps, significators and planets, Parashari houses, planets, aspects and divisional charts, Jaimini karakas, recorded past events, (with from and to) the dasha periods of that stretch of life in each school's own calendar, a shortlist of every larger period covering it, and the slow transits, and (with at) the periods and slow transits running at one moment. Facts only; it draws no conclusion.",
    parameters: EvidenceInput,
  },
  verify: {
    name: "ascendant_verify",
    description:
      "Check a draft answer against its worksheet: every cited fact id and period id must exist for this person, every date in the draft must fall in a chosen period or be a recorded date, vague timing and unsupported confidence are refused, and the wording rules must hold. Returns ok or the problems to fix.",
    parameters: VerifyInput,
  },
} as const;
