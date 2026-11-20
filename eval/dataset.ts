import { Array as Arr, DateTime, Option, pipe, Result, Schema } from "effect";

import { Latitude, Longitude, OffsetMoment, Sex } from "../skills/ascendant/tools/contract.ts";
import { findKpEvent, KpEvent, KpEventId } from "../skills/ascendant/tools/events.ts";

export const EvalPerson = Schema.Struct({
  id: Schema.String,
  birth: OffsetMoment,
  latitude: Latitude,
  longitude: Longitude,
  sex: Schema.optional(Sex),
  events: Schema.Array(
    Schema.Struct({
      event: KpEventId,
      date: Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
    }),
  ),
});
export interface EvalPerson extends Schema.Schema.Type<typeof EvalPerson> {}

export const AGE_BINS = 80;
export const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export const Case = Schema.Struct({
  personIndex: Schema.Int,
  event: KpEvent,
  noonUtc: Schema.DateTimeUtc,
  ageYears: Schema.Int,
});
export interface Case extends Schema.Schema.Type<typeof Case> {}

export const Dataset = Schema.Struct({
  persons: Schema.Array(EvalPerson),
  cases: Schema.Array(Case),
  problems: Schema.Array(Schema.String),
});
export interface Dataset extends Schema.Schema.Type<typeof Dataset> {}

const parseJson = Option.liftThrowable((raw: string): unknown => JSON.parse(raw));
const decodePerson = Schema.decodeUnknownResult(EvalPerson);

const firstLine = (message: string): string => message.split("\n")[0] ?? message;

const parsePerson = (
  raw: string,
  index: number,
): Option.Option<Result.Result<EvalPerson, string>> =>
  raw.trim() === ""
    ? Option.none()
    : Option.some(
        pipe(
          parseJson(raw),
          Option.match({
            onNone: () => Result.fail(`line ${index + 1}: not JSON`),
            onSome: (json) =>
              Result.mapError(
                decodePerson(json),
                (error) => `line ${index + 1}: ${firstLine(error.message)}`,
              ),
          }),
        ),
      );

const casesOf = (
  person: EvalPerson,
  personIndex: number,
): ReadonlyArray<Result.Result<Case, string>> =>
  Option.match(DateTime.make(person.birth), {
    onNone: () => [Result.fail(`${person.id}: unreadable birth moment`)],
    onSome: (birth) =>
      Arr.map(person.events, (entry) =>
        pipe(
          Option.all({
            event: findKpEvent(entry.event),
            noonUtc: DateTime.make(`${entry.date}T12:00:00Z`),
          }),
          Option.match({
            onNone: () =>
              Result.fail(`${person.id}: unreadable event ${entry.event} ${entry.date}`),
            onSome: ({ event, noonUtc }) => {
              const ageYears = Math.floor(
                (DateTime.toEpochMillis(noonUtc) - DateTime.toEpochMillis(birth)) / YEAR_MS,
              );
              return ageYears < 0 || ageYears >= AGE_BINS
                ? Result.fail(
                    `${person.id}: ${entry.event} at age ${ageYears} is outside 0 to ${AGE_BINS - 1}`,
                  )
                : Result.succeed<Case>({ personIndex, event, noonUtc, ageYears });
            },
          }),
        ),
      ),
  });

export function parseDataset(text: string): Dataset {
  const [persons, dropped] = pipe(
    text.split(/\r?\n/),
    Arr.map(parsePerson),
    Arr.getSomes,
    Arr.separate,
  );
  const [cases, unusable] = pipe(persons, Arr.flatMap(casesOf), Arr.separate);
  return { persons, cases, problems: [...dropped, ...unusable] };
}
