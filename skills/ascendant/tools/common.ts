// Direct subpaths only: the `@effect/platform-bun` barrel pulls in
// socket/cluster modules that import private `effect/*/*` paths, which
// OpenCode refuses to load into plugins. BunFileSystem stays within
// public single-level `effect/*` subpaths; Path comes from ./path.ts
// because BunPath needs `make`, which the host's `effect/Path` lacks.
// See .opencode/plugins/ascendant.
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import { AstroParams, Chart } from "astro-ascendant";
import * as Swisseph from "astro-ascendant/swisseph";
import { Array as Arr, DateTime, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";

import { Latitude, Longitude, OffsetMoment, PersonName, Sex } from "./contract.ts";
import { PathLive } from "./path.ts";
export { Latitude, Longitude, OffsetMoment, PersonName, Sex };

export const StoredPerson = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  name: PersonName,
  moment: OffsetMoment,
  latitude: Latitude,
  longitude: Longitude,
  sex: Schema.optional(Sex),
});
export type StoredPerson = typeof StoredPerson.Type;

export class PersonRecordNotFound extends Schema.TaggedError<PersonRecordNotFound>()(
  "PersonRecordNotFound",
  {
    file: Schema.String,
    message: Schema.String,
  },
) {}

export class PersonRecordConflict extends Schema.TaggedError<PersonRecordConflict>()(
  "PersonRecordConflict",
  {
    directory: Schema.String,
    message: Schema.String,
  },
) {}

export class RecordDecodingError extends Schema.TaggedError<RecordDecodingError>()(
  "RecordDecodingError",
  {
    file: Schema.String,
    message: Schema.String,
  },
) {}

export class ChartIncomplete extends Schema.TaggedError<ChartIncomplete>()("ChartIncomplete", {
  message: Schema.String,
}) {}

const NodeServicesLayer: Layer.Layer<FileSystem.FileSystem | Path.Path> = Layer.mergeAll(
  BunFileSystem.layer,
  PathLive,
);

export const PlatformLayer: Layer.Layer<FileSystem.FileSystem | Path.Path> = NodeServicesLayer;

export const VedicAstroParams = AstroParams.Options.make({
  ayanamsa: "Lahiri",
  houseSystem: "WholeSign",
});

export const KpAstroParams = AstroParams.Options.make({
  ayanamsa: "KrishnamurtiVP291",
  houseSystem: "Placidus",
});

export const VedicAstroParamsLayer = AstroParams.layer(VedicAstroParams);
export const KpAstroParamsLayer = AstroParams.layer(KpAstroParams);

export const AppLayer = Layer.mergeAll(
  PlatformLayer,
  VedicAstroParamsLayer,
  Swisseph.SwissephLayer,
);

export type CalculationSchool = "Parashari" | "KP";
export type CalculationContext = ReturnType<typeof calculationContext>;

export function calculationContext(school: CalculationSchool, astroParams: AstroParams.Options) {
  return {
    school,
    ayanamsa: astroParams.ayanamsa,
    houseSystem: astroParams.houseSystem,
    dashaSystem: "Vimshottari" as const,
  };
}

export const decodeMoment = Effect.fn("Ascendant.decodeMoment")(function* (input: OffsetMoment) {
  return yield* Schema.decodeUnknownEffect(Schema.DateTimeUtcFromString)(input);
});

export function makeLocatedMoment(
  date: DateTime.Utc,
  latitude: Latitude,
  longitude: Longitude,
): Chart.LocatedMoment {
  return Chart.LocatedMoment.make({
    moment: Chart.Moment.make({ date }),
    latitude,
    longitude,
  });
}

const momentOf = Schema.decodeUnknownOption(Schema.DateTimeUtcFromString);

function momentsEqual(left: OffsetMoment, right: OffsetMoment): boolean {
  return (
    left === right ||
    Option.getOrElse(
      Option.zipWith(momentOf(left), momentOf(right), DateTime.Equivalence),
      () => false,
    )
  );
}

export function personRecordMatches(left: StoredPerson, right: StoredPerson): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.name === right.name &&
    momentsEqual(left.moment, right.moment) &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.sex === right.sex
  );
}

export const writeMarkdown = Effect.fn("Ascendant.writeMarkdown")(function* (
  file: string,
  content: string,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(file, content.endsWith("\n") ? content : `${content}\n`);
});

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatterValue(value: string): string | number {
  const trimmed = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseInputFrontmatter(contents: string, inputFile: string) {
  const match = contents.match(FRONTMATTER_PATTERN);
  if (match?.[1] === undefined) {
    return Effect.fail(
      new RecordDecodingError({
        file: inputFile,
        message: "Missing frontmatter in input.md",
      }),
    );
  }
  const fields: Record<string, string | number> = Object.fromEntries(
    Arr.getSomes(
      Arr.map(match[1].split(/\r?\n/), (line) => {
        const colon = line.indexOf(":");
        return colon > 0
          ? Option.some([
              line.slice(0, colon).trim(),
              parseFrontmatterValue(line.slice(colon + 1)),
            ] as const)
          : Option.none();
      }),
    ),
  );
  return Schema.decodeUnknownEffect(StoredPerson)({
    schemaVersion: 1,
    name: fields["name"],
    moment: fields["birth"] ?? fields["moment"],
    latitude: fields["latitude"],
    longitude: fields["longitude"],
    ...(fields["sex"] !== undefined ? { sex: fields["sex"] } : {}),
  }).pipe(
    Effect.mapError(
      (cause) =>
        new RecordDecodingError({
          file: inputFile,
          message: String(cause),
        }),
    ),
  );
}

export const readStoredPerson = Effect.fn("Ascendant.readStoredPerson")(function* (
  name: PersonName,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const inputFile = path.join("persons", name, "input.md");

  if (!(yield* fs.exists(inputFile))) {
    return yield* new PersonRecordNotFound({
      file: inputFile,
      message: `No initialized person record exists for ${name}`,
    });
  }

  const contents = yield* fs.readFileString(inputFile);
  return yield* parseInputFrontmatter(contents, inputFile);
});
