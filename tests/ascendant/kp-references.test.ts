import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { kpLordChain } from "../../skills/ascendant/tools/kp-lords.ts";

const KP_DIRECTORY = "skills/ascendant/references/kp";
const read = (file: string) =>
  readFileSync(`${KP_DIRECTORY}/${file}`, "utf8").replace(/\r\n/g, "\n");

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

function degrees(mark: string): number {
  const match = mark.match(/^(\d\d)°(\d\d)'(\d\d)"$/);
  if (match === null) throw new Error(`Malformed degree mark: ${mark}`);
  return Number(match[1]) + Number(match[2]) / 60 + Number(match[3]) / 3600;
}

describe("sub-lord table", () => {
  const rows = read("sub-lord-table.csv")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));

  test("covers the zodiac once, in order, with well-formed degrees", () => {
    let previousEnd = 0;
    rows.forEach((row, index) => {
      const [number, sign, from, to] = row;
      expect(Number(number)).toBe(index + 1);
      const offset = SIGNS.indexOf(sign ?? "") * 30;
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset + degrees(from ?? "")).toBeCloseTo(previousEnd, 3);
      previousEnd = offset + degrees(to ?? "");
    });
    expect(previousEnd).toBeCloseTo(360, 3);
  });

  test("agrees with the engine's lord chain at every row", () => {
    for (const row of rows) {
      const [number, sign, from, to, signLord, starLord, subLord] = row;
      const offset = SIGNS.indexOf(sign ?? "") * 30;
      const middle = (offset + degrees(from ?? "") + offset + degrees(to ?? "")) / 2;
      const engine = kpLordChain(middle);
      expect([number, engine.signLord, engine.starLord, engine.subLord]).toEqual([
        number,
        signLord,
        starLord,
        subLord,
      ]);
    }
  });
});

describe("house grouping", () => {
  test("has twelve sections whose events name that house as primary", () => {
    let section = 0;
    const sections: number[] = [];
    let events = 0;
    for (const line of read("house-grouping.md").split("\n")) {
      const heading = line.match(/^## (\d+)\. Events relating/);
      if (heading !== null) {
        section = Number(heading[1]);
        sections.push(section);
        continue;
      }
      if (section === 0 || !line.startsWith("|") || /^\| (Type of Query|---)/.test(line)) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      expect(cells).toHaveLength(3);
      expect(Number(cells[1])).toBe(section);
      events++;
    }
    expect(sections).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(events).toBe(114);
  });
});
