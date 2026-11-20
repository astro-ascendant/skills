import { findKpEvent, type KpEvent } from "./events.ts";

/**
 * Reads the dated events in a person's `MEMORY.md`. Pure: text in, records out.
 *
 * A line is `- [DD/MM/YYYY]: message`, or `- [DD/MM/YYYY] #<event-id>: message`
 * when the event is one the judge knows (`ascendant events`). Only tagged lines
 * feed the judge; an untagged line stays a note for the reader. An empty or
 * missing file gives no events, and the judge then works from the chart alone.
 */

export interface MemoryEvent {
  /** 1-based line in the file. */
  readonly line: number;
  /** Calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** Noon UTC of that date, epoch milliseconds: the file records no time of day. */
  readonly at: number;
  readonly event: KpEvent;
  readonly message: string;
}

export type IgnoredReason = "malformed" | "untagged" | "unknown-event";

export interface IgnoredLine {
  readonly line: number;
  readonly reason: IgnoredReason;
}

export interface Memory {
  /** Tagged events, oldest first. */
  readonly events: ReadonlyArray<MemoryEvent>;
  readonly ignored: ReadonlyArray<IgnoredLine>;
}

const ENTRY = /^- \[(\d{2})\/(\d{2})\/(\d{4})\](?: #([a-z0-9-]+))?: (.*)$/;

const NOON_MS = 12 * 60 * 60 * 1000;

/** Epoch milliseconds at 00:00 UTC, or undefined when the date does not exist. */
function dayStart(year: number, month: number, day: number): number | undefined {
  const start = Date.UTC(year, month - 1, day);
  const date = new Date(start);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? start
    : undefined;
}

export function parseMemory(text: string): Memory {
  const events: Array<MemoryEvent> = [];
  const ignored: Array<IgnoredLine> = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const entry = raw.trimEnd();
    if (!entry.startsWith("- [")) return;
    const match = entry.match(ENTRY);
    const start =
      match === null ? undefined : dayStart(Number(match[3]), Number(match[2]), Number(match[1]));
    if (match === null || start === undefined) {
      ignored.push({ line, reason: "malformed" });
      return;
    }
    const tag = match[4];
    if (tag === undefined) {
      ignored.push({ line, reason: "untagged" });
      return;
    }
    const event = findKpEvent(tag);
    if (event === undefined) {
      ignored.push({ line, reason: "unknown-event" });
      return;
    }
    events.push({
      line,
      date: `${match[3]}-${match[2]}-${match[1]}`,
      at: start + NOON_MS,
      event,
      message: match[5] ?? "",
    });
  });
  events.sort((left, right) => left.at - right.at || left.line - right.line);
  return { events, ignored };
}
