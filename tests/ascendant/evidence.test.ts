import { describe, expect, it } from "@effect/vitest";
import { DateTime, Option } from "effect";

import {
  antaraRunningAt,
  coverageBlocks,
  aspectedHouses,
  jaiminiFacts,
  kpHouseOf,
  memoryFacts,
  parsePeriodId,
  parseTransitFactId,
  periodRows,
  resolvePeriod,
  runningPeriods,
  sharedWithRecord,
  signOf,
  transitFactId,
  transitFacts,
  type Timeline,
} from "../../skills/ascendant/tools/evidence.ts";

const utc = (iso: string): DateTime.Utc => DateTime.makeUnsafe(iso);

const timelineFrom = (start: string): Timeline => [
  {
    mahadasha: "Moon",
    start: utc(`2000-01-${start}T00:00:00Z`),
    end: utc("2010-01-01T00:00:00Z"),
    antardashas: [
      {
        mahadasha: "Moon",
        antardasha: "Moon",
        start: utc(`2000-01-${start}T00:00:00Z`),
        end: utc(`2000-11-${start}T00:00:00Z`),
      },
      {
        mahadasha: "Moon",
        antardasha: "Mars",
        start: utc(`2000-11-${start}T00:00:00Z`),
        end: utc(`2001-06-${start}T00:00:00Z`),
      },
    ],
  },
];
const timeline = timelineFrom("01");
const timelines = { kp: timeline, par: timelineFrom("20") };
const birth = utc("2000-06-01T00:00:00Z");

describe("aspects", () => {
  it("gives every planet the seventh and the special aspects to three of them", () => {
    expect(aspectedHouses("Sun", 1)).toEqual([7]);
    expect(aspectedHouses("Mars", 5)).toEqual([11, 8, 12]);
    expect(aspectedHouses("Jupiter", 11)).toEqual([5, 3, 7]);
    expect(aspectedHouses("Saturn", 9)).toEqual([3, 11, 6]);
    expect(aspectedHouses("Rahu", 1)).toEqual([]);
  });
});

describe("periods", () => {
  it("lists the periods of a stretch with their calendar and the age at their start", () => {
    const rows = periodRows(
      timeline,
      "kp",
      "bhukti",
      { start: utc("2000-10-01T00:00:00Z"), end: utc("2001-01-01T00:00:00Z") },
      birth,
    );
    expect(rows.map((row) => [row.id, row.ageAtStart])).toEqual([
      ["kp:Moon-Moon", 0],
      ["kp:Moon-Mars", 0.4],
    ]);
  });

  it("keeps the two calendars apart: the same period id resolves to different dates", () => {
    const startOf = (id: string) =>
      Option.map(resolvePeriod(timelines, id, birth), (span) =>
        DateTime.formatIsoDateUtc(span.start),
      );
    expect(startOf("kp:Moon-Mars")).toEqual(Option.some("2000-11-01"));
    expect(startOf("par:Moon-Mars")).toEqual(Option.some("2000-11-20"));
    expect(startOf("Moon-Mars")).toEqual(Option.none());
    expect(startOf("kp:Moon-Venus")).toEqual(Option.none());
    expect(startOf("kp:Moon-Mars-Mars-Mars-Mars")).toEqual(Option.none());
  });

  it("goes down to the fourth level", () => {
    const window = { start: utc("2000-11-01T00:00:00Z"), end: utc("2000-11-02T00:00:00Z") };
    expect(periodRows(timeline, "kp", "sookshma", window, birth)[0]?.id).toBe(
      "kp:Moon-Mars-Mars-Mars",
    );
  });

  it("reads a period id into its calendar and lords", () => {
    expect(parsePeriodId("par:Moon-Mars")).toEqual(
      Option.some({ calendar: "par", lords: ["Moon", "Mars"] }),
    );
    expect(parsePeriodId("lunar:Moon-Mars")).toEqual(Option.none());
  });
});

describe("coverage", () => {
  it("names every larger period that takes a real share of the stretch", () => {
    const blocks = (start: string, end: string) =>
      coverageBlocks(timeline, "kp", { start: utc(start), end: utc(end) }, birth).blocks.map(
        (block) => block.id,
      );
    expect(blocks("2000-06-01T00:00:00Z", "2001-06-01T00:00:00Z")).toEqual([
      "kp:Moon-Moon",
      "kp:Moon-Mars",
    ]);
    expect(blocks("2000-10-20T00:00:00Z", "2001-06-01T00:00:00Z")).toEqual(["kp:Moon-Mars"]);
  });
});

describe("running periods", () => {
  it("names the period running at a moment at every level", () => {
    expect(
      runningPeriods(timeline, "kp", utc("2000-11-01T12:00:00Z"), birth).map((row) => row.id),
    ).toEqual(["kp:Moon", "kp:Moon-Mars", "kp:Moon-Mars-Mars", "kp:Moon-Mars-Mars-Mars"]);
  });
});

describe("other facts", () => {
  it("lists Jaimini karakas and the karakamsha", () => {
    expect(
      jaiminiFacts({
        karakas: [{ role: "Atmakaraka", planets: ["Mercury"] }],
        karakamsha: [{ planet: "Mercury", sign: "Sagittarius" }],
      }).map(({ id, text }) => [id, text]),
    ).toEqual([
      ["jaimini.karaka.Atmakaraka", "Jaimini Atmakaraka is Mercury"],
      ["jaimini.karakamsha.Mercury", "Jaimini karakamsha: Mercury falls in Sagittarius in the D9"],
    ]);
  });

  const memory = {
    events: [],
    notes: [{ line: 7, date: "2000-11", noonUtc: utc("2000-11-15T12:00:00Z"), message: "Met her" }],
  };
  const running = (moment: DateTime.Utc) => antaraRunningAt(timeline, "kp", moment, birth);

  it("gives recorded notes an id and the period running then", () => {
    expect(memoryFacts(memory, running).map(({ id, text }) => [id, text])).toEqual([
      ["memory.7", "Recorded on 2000-11: Met her. Period running then: kp:Moon-Mars-Rahu"],
    ]);
  });

  it("says which lords a candidate shares with each recorded event", () => {
    expect(sharedWithRecord(["Moon", "Jupiter", "Rahu"], memory, running)).toEqual([
      "memory.7 (2000-11: Met her) ran under kp:Moon-Mars-Rahu; lords in common: Moon, Rahu",
    ]);
  });
});

describe("slow transits", () => {
  it("names the sign of a longitude", () => {
    expect([signOf(0), signOf(29.99), signOf(30), signOf(359.9), signOf(-1)]).toEqual([
      "Aries",
      "Aries",
      "Taurus",
      "Pisces",
      "Pisces",
    ]);
  });

  it("finds the house a longitude falls in between unequal cusps", () => {
    const cusps = [208, 237, 266, 298, 330, 0, 28, 57, 86, 118, 150, 180];
    expect([90, 117.9, 118, 207, 208, 359, 0, 27].map((at) => kpHouseOf(at, cusps))).toEqual([
      9, 9, 10, 12, 1, 5, 6, 6,
    ]);
  });

  it("turns samples into stays and names the house in both systems", () => {
    const facts = transitFacts(
      "Jupiter",
      [
        { at: utc("2024-01-01T00:00:00Z"), sign: "Aries", kpHouse: 6 },
        { at: utc("2024-01-04T00:00:00Z"), sign: "Aries", kpHouse: 7 },
        { at: utc("2024-01-07T00:00:00Z"), sign: "Taurus", kpHouse: 7 },
      ],
      "Libra",
      "Aries",
    );
    expect(facts).toEqual([
      {
        id: "transit.Jupiter.Aries.2024-01-01",
        text: "Transit Jupiter in Aries from about 2024-01-01 to about 2024-01-04. Parashari (whole-sign houses): house 7 from the lagna, house 1 from the Moon. KP (Placidus cusps): house 6 at the start, house 7 at the end",
      },
      {
        id: "transit.Jupiter.Taurus.2024-01-07",
        text: "Transit Jupiter in Taurus from about 2024-01-07 to about 2024-01-07. Parashari (whole-sign houses): house 8 from the lagna, house 2 from the Moon. KP (Placidus cusps): house 7 throughout",
      },
    ]);
  });

  it("reads a transit id back, and refuses one that is not a transit", () => {
    const id = transitFactId("Saturn", "Pisces", utc("2025-03-29T00:00:00Z"));
    expect(id).toBe("transit.Saturn.Pisces.2025-03-29");
    expect(Option.map(parseTransitFactId(id), (found) => [found.planet, found.sign])).toEqual(
      Option.some(["Saturn", "Pisces"]),
    );
    expect(parseTransitFactId("transit.Sun.Pisces.2025-03-29")).toEqual(Option.none());
    expect(parseTransitFactId("kp.cusp.7")).toEqual(Option.none());
  });
});
