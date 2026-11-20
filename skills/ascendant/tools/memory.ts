import { Array as Arr, DateTime, Option, Order, pipe, Result, Schema } from "effect";

import { findKpEvent, KpEvent } from "./events.ts";

export const MemoryEvent = Schema.Struct({
  line: Schema.Int,
  date: Schema.String,
  noonUtc: Schema.DateTimeUtc,
  event: KpEvent,
  message: Schema.String,
});
export interface MemoryEvent extends Schema.Schema.Type<typeof MemoryEvent> {}

export const IgnoredReason = Schema.Literals(["malformed", "untagged", "unknown-event"]);
export type IgnoredReason = typeof IgnoredReason.Type;

export const IgnoredLine = Schema.Struct({ line: Schema.Int, reason: IgnoredReason });
export interface IgnoredLine extends Schema.Schema.Type<typeof IgnoredLine> {}

export const Memory = Schema.Struct({
  events: Schema.Array(MemoryEvent),
  ignored: Schema.Array(IgnoredLine),
});
export interface Memory extends Schema.Schema.Type<typeof Memory> {}

export const emptyMemory: Memory = { events: [], ignored: [] };

const ENTRY = /^- \[(\d{2})\/(\d{2})\/(\d{4})\](?: #([a-z0-9-]+))?: (.*)$/;

const noonOn = (year: number, month: number, day: number): Option.Option<DateTime.Utc> =>
  pipe(
    DateTime.make({ year, month, day, hour: 12 }),
    Option.filter((moment) => {
      const parts = DateTime.toPartsUtc(moment);
      return parts.year === year && parts.month === month && parts.day === day;
    }),
  );

const byDateThenLine: Order.Order<MemoryEvent> = Order.combine(
  Order.mapInput(DateTime.Order, (entry: MemoryEvent) => entry.noonUtc),
  Order.mapInput(Order.Number, (entry: MemoryEvent) => entry.line),
);

const parseLine = (
  raw: string,
  index: number,
): Option.Option<Result.Result<MemoryEvent, IgnoredLine>> => {
  const line = index + 1;
  const entry = raw.trimEnd();
  if (!entry.startsWith("- [")) return Option.none();
  const ignored = (reason: IgnoredReason) => Result.fail<IgnoredLine>({ line, reason });
  return Option.some(
    pipe(
      Option.fromNullishOr(entry.match(ENTRY)),
      Option.flatMap(([, day = "", month = "", year = "", tag, message = ""]) =>
        Option.map(noonOn(Number(year), Number(month), Number(day)), (noonUtc) => ({
          noonUtc,
          date: `${year}-${month}-${day}`,
          tag: Option.fromUndefinedOr(tag),
          message,
        })),
      ),
      Option.match({
        onNone: () => ignored("malformed"),
        onSome: ({ noonUtc, date, tag, message }) =>
          Option.match(tag, {
            onNone: () => ignored("untagged"),
            onSome: (id) =>
              Option.match(findKpEvent(id), {
                onNone: () => ignored("unknown-event"),
                onSome: (event) =>
                  Result.succeed<MemoryEvent>({ line, date, noonUtc, event, message }),
              }),
          }),
      }),
    ),
  );
};

export function parseMemory(text: string): Memory {
  const [events, ignored] = pipe(
    text.split(/\r?\n/),
    Arr.map(parseLine),
    Arr.getSomes,
    Arr.separate,
  );
  return { events: Arr.sort(events, byDateThenLine), ignored };
}
