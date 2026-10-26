import { Schema } from "effect";

export const PersonName = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,79}$/u, {
      message: "Use 1-80 letters, numbers, spaces, apostrophes, periods, or hyphens",
    }),
  ),
  Schema.brand("PersonName"),
);
export type PersonName = typeof PersonName.Type;

export const OffsetMoment = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, {
      message: "Use an ISO 8601 moment with Z or an explicit UTC offset",
    }),
  ),
);
export type OffsetMoment = typeof OffsetMoment.Type;

export const Latitude = Schema.Finite.pipe(
  Schema.check(Schema.isBetween({ minimum: -90, maximum: 90 })),
  Schema.brand("Latitude"),
);
export type Latitude = typeof Latitude.Type;

export const Longitude = Schema.Finite.pipe(
  Schema.check(Schema.isBetween({ minimum: -180, maximum: 180 })),
  Schema.brand("Longitude"),
);
export type Longitude = typeof Longitude.Type;

export const Sex = Schema.Literals(["Male", "Female"]);
export type Sex = typeof Sex.Type;
