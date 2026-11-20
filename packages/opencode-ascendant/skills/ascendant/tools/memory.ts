import { Array as Arr, DateTime, Option, Order, pipe, Schema } from "effect";

import { findKpEvent, KpEvent } from "./events.ts";

export const MemoryEvent = Schema.Struct({
  line: Schema.Int,
  date: Schema.String,
  noonUtc: Schema.DateTimeUtc,
  event: KpEvent,
  message: Schema.String,
});
export interface MemoryEvent extends Schema.Schema.Type<typeof MemoryEvent> {}

export const MemoryNote = Schema.Struct({
  line: Schema.Int,
  date: Schema.String,
  noonUtc: Schema.DateTimeUtc,
  message: Schema.String,
});
export interface MemoryNote extends Schema.Schema.Type<typeof MemoryNote> {}

export const IgnoredReason = Schema.Literals(["malformed", "untagged", "unknown-event"]);
export type IgnoredReason = typeof IgnoredReason.Type;

export const IgnoredLine = Schema.Struct({ line: Schema.Int, reason: IgnoredReason });
export interface IgnoredLine extends Schema.Schema.Type<typeof IgnoredLine> {}

export const Memory = Schema.Struct({
  events: Schema.Array(MemoryEvent),
  notes: Schema.Array(MemoryNote),
  ignored: Schema.Array(IgnoredLine),
});
export interface Memory extends Schema.Schema.Type<typeof Memory> {}

export const emptyMemory: Memory = { events: [], notes: [], ignored: [] };

const BRACKETED_ENTRY = /^- \[(?:(\d{2})\/)?(\d{2})\/(\d{4})\](?: #([a-z0-9-]+))?: (.*)$/;
const DASHED_ENTRY = /^[*-] (.+?) - (?:#([a-z0-9-]+) )?(.*)$/;

const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
const SLASHED_DATE = /^(?:(\d{2})\/)?(\d{2})\/(\d{4})$/;
const NAMED_DATE = /^(?:(\d{1,2}) )?([A-Za-z]{3,9}) (\d{4})$/;

const MONTH_PREFIXES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const MID_MONTH = 15;

interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: Option.Option<number>;
}

const numberOf = (text: string | undefined): Option.Option<number> =>
  Option.map(Option.fromUndefinedOr(text), Number);

const monthNamed = (name: string): Option.Option<number> =>
  pipe(
    Arr.findFirstIndex(MONTH_PREFIXES, (prefix) => name.toLowerCase().startsWith(prefix)),
    Option.map((index) => index + 1),
  );

const datePartsOf = (text: string): Option.Option<DateParts> =>
  Option.firstSomeOf([
    Option.map(Option.fromNullishOr(text.match(ISO_DATE)), ([, year, month, day]) => ({
      year: Number(year),
      month: Number(month),
      day: numberOf(day),
    })),
    Option.map(Option.fromNullishOr(text.match(SLASHED_DATE)), ([, day, month, year]) => ({
      year: Number(year),
      month: Number(month),
      day: numberOf(day),
    })),
    Option.flatMap(Option.fromNullishOr(text.match(NAMED_DATE)), ([, day, name = "", year]) =>
      Option.map(monthNamed(name), (month) => ({ year: Number(year), month, day: numberOf(day) })),
    ),
  ]);

const twoDigits = (value: number): string => String(value).padStart(2, "0");

interface DatedText {
  readonly noonUtc: DateTime.Utc;
  readonly date: string;
}

const datedOf = ({ year, month, day }: DateParts): Option.Option<DatedText> => {
  const dayOfMonth = Option.getOrElse(day, () => MID_MONTH);
  return pipe(
    DateTime.make({ year, month, day: dayOfMonth, hour: 12 }),
    Option.filter((moment) => {
      const parts = DateTime.toPartsUtc(moment);
      return parts.year === year && parts.month === month && parts.day === dayOfMonth;
    }),
    Option.map((noonUtc) => ({
      noonUtc,
      date: Option.match(day, {
        onNone: () => `${year}-${twoDigits(month)}`,
        onSome: (given) => `${year}-${twoDigits(month)}-${twoDigits(given)}`,
      }),
    })),
  );
};

interface Dated {
  readonly line: number;
  readonly noonUtc: DateTime.Utc;
}

const byDateThenLine: Order.Order<Dated> = Order.combine(
  Order.mapInput(DateTime.Order, (entry: Dated) => entry.noonUtc),
  Order.mapInput(Order.Number, (entry: Dated) => entry.line),
);

type Parsed =
  | { readonly _tag: "Event"; readonly event: MemoryEvent }
  | { readonly _tag: "Note"; readonly note: MemoryNote; readonly ignored: IgnoredLine }
  | { readonly _tag: "Ignored"; readonly ignored: IgnoredLine };

interface Entry {
  readonly dateParts: Option.Option<DateParts>;
  readonly tag: Option.Option<string>;
  readonly message: string;
}

const entryOf = (text: string): Option.Option<Entry> =>
  text.startsWith("- [")
    ? Option.map(
        Option.fromNullishOr(text.match(BRACKETED_ENTRY)),
        ([, day, month, year, tag, message = ""]) => ({
          dateParts: Option.some({ year: Number(year), month: Number(month), day: numberOf(day) }),
          tag: Option.fromUndefinedOr(tag),
          message,
        }),
      )
    : Option.map(
        Option.fromNullishOr(text.match(DASHED_ENTRY)),
        ([, date = "", tag, message = ""]) => ({
          dateParts: datePartsOf(date.trim()),
          tag: Option.fromUndefinedOr(tag),
          message,
        }),
      );

const parseLine = (raw: string, index: number): Option.Option<Parsed> => {
  const line = index + 1;
  const text = raw.trimEnd();
  if (!text.startsWith("- ") && !text.startsWith("* ")) return Option.none();
  const malformed: Parsed = { _tag: "Ignored", ignored: { line, reason: "malformed" } };
  return Option.some(
    pipe(
      entryOf(text),
      Option.flatMap((entry) =>
        Option.map(Option.flatMap(entry.dateParts, datedOf), (dated) => ({ ...entry, ...dated })),
      ),
      Option.match({
        onNone: () => malformed,
        onSome: ({ noonUtc, date, tag, message }): Parsed => {
          const noteFor = (reason: IgnoredReason): Parsed => ({
            _tag: "Note",
            note: { line, date, noonUtc, message },
            ignored: { line, reason },
          });
          return Option.match(tag, {
            onNone: () => noteFor("untagged"),
            onSome: (id) =>
              Option.match(findKpEvent(id), {
                onNone: () => noteFor("unknown-event"),
                onSome: (event): Parsed => ({
                  _tag: "Event",
                  event: { line, date, noonUtc, event, message },
                }),
              }),
          });
        },
      }),
    ),
  );
};

export function parseMemory(text: string): Memory {
  const parsed = pipe(text.split(/\r?\n/), Arr.map(parseLine), Arr.getSomes);
  return {
    events: pipe(
      parsed,
      Arr.flatMap((entry) => (entry._tag === "Event" ? [entry.event] : [])),
      Arr.sort(byDateThenLine),
    ),
    notes: pipe(
      parsed,
      Arr.flatMap((entry) => (entry._tag === "Note" ? [entry.note] : [])),
      Arr.sort(byDateThenLine),
    ),
    ignored: Arr.flatMap(parsed, (entry) => (entry._tag === "Event" ? [] : [entry.ignored])),
  };
}
