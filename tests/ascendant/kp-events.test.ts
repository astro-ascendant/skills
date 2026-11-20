import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { EXCLUDED_KP_EVENTS, KP_EVENTS } from "../../skills/ascendant/tools/events.ts";

const guidebook = readFileSync("skills/ascendant/references/kp/house-grouping.md", "utf8").replace(
  /\r\n/g,
  "\n",
);

interface Row {
  readonly section: string;
  readonly label: string;
  readonly primary: number;
  readonly supporting: string;
}

function guidebookRows(): ReadonlyArray<Row> {
  const rows: Array<Row> = [];
  let section = "";
  for (const line of guidebook.split("\n")) {
    const heading = line.match(/^## (?:\d+\. )?(.+)$/);
    if (heading !== null) {
      section = /^## \d+\. /.test(line) ? (heading[1] ?? "") : "";
      continue;
    }
    const row = line.match(/^\| (.+?) \| (\d+) \| (.+?) \|$/);
    if (section === "" || row === null) continue;
    rows.push({
      section,
      label: (row[1] ?? "").trim(),
      primary: Number(row[2]),
      supporting: (row[3] ?? "").trim(),
    });
  }
  return rows;
}

const written = (supporting: ReadonlyArray<number>, parenthesised: ReadonlyArray<number>): string =>
  parenthesised.length === 0
    ? supporting.join(",")
    : `${supporting.join(",")}(${parenthesised.join(",")})`;

describe("KP event table", () => {
  const rows = guidebookRows();

  test("every guidebook row is either judged or refused, never both", () => {
    expect(rows.length).toBe(KP_EVENTS.length + EXCLUDED_KP_EVENTS.length);
    for (const row of rows) {
      const judged = KP_EVENTS.filter(
        (event) =>
          event.label === row.label &&
          event.primary === row.primary &&
          event.section === row.section,
      );
      const refused = EXCLUDED_KP_EVENTS.filter(
        (event) => event.label === row.label && event.primary === row.primary,
      );
      expect([row.label, row.primary, judged.length + refused.length]).toEqual([
        row.label,
        row.primary,
        1,
      ]);
    }
  });

  test("judged events carry the guidebook's houses exactly", () => {
    for (const event of KP_EVENTS) {
      const row = rows.find(
        (candidate) => candidate.label === event.label && candidate.primary === event.primary,
      );
      expect([event.id, row?.supporting.replace(/\s/g, "")]).toEqual([
        event.id,
        written(event.supporting, event.parenthesised),
      ]);
    }
  });

  test("event ids are unique", () => {
    const ids = KP_EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no death, accident, assault or illness row is judged", () => {
    const blocked = /death|accident|suicide|rape|life$|sickness|disease-|proneness|depression/i;
    expect(
      KP_EVENTS.filter((event) => blocked.test(event.label)).map((event) => event.label),
    ).toEqual([]);
    const refused = (reason: string) =>
      EXCLUDED_KP_EVENTS.filter((event) => event.reason === reason).length;
    expect(refused("safety")).toBe(17);
    expect(refused("non-numeric")).toBe(2);
  });
});
