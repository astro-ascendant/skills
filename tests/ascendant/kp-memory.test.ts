import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { DateTime, Effect, Option, Schema } from "effect";

import { addPersonFromInput } from "../../skills/ascendant/tools/add-person.ts";
import {
  AppLayer,
  Latitude,
  Longitude,
  OffsetMoment,
  PersonName,
} from "../../skills/ascendant/tools/common.ts";
import { findKpEvent, type House } from "../../skills/ascendant/tools/events.ts";
import {
  checkBirthTime,
  confidenceWithMemory,
  fitPastEvent,
  scoreFit,
  type Fit,
} from "../../skills/ascendant/tools/kp-hindcast.ts";
import {
  judgeKp,
  KP_HOUSES,
  KP_PLANETS,
  type Confidence,
  type KpFacts,
  type KpPeriod,
  type Sky,
  type Levels,
  type Planet,
} from "../../skills/ascendant/tools/kp-judge.ts";
import { parseMemory } from "../../skills/ascendant/tools/memory.ts";
import { JudgeInput } from "../../skills/ascendant/tools/tool-specs.ts";
import { decodeInput, judge } from "../../skills/ascendant/tools/workflows.ts";

const marriage = Option.getOrThrow(findKpEvent("marriage"));
const at = (epochMillis: number): DateTime.Utc => DateTime.makeUnsafe(epochMillis);

describe("memory parser", () => {
  const text = [
    "---",
    "name: Ada",
    "birth: 1990-01-01T06:30:00.000Z",
    "---",
    "",
    "- [12/11/2022] #child-birth: First child",
    "- [15/06/2008]: Moved school",
    "- [20/02/2019] #marriage: Married: registry, then ceremony",
    "- [31/02/2020] #foreign-travel: no such date",
    "- [05/05/2021] #nonsense: unknown tag",
    "- [5/5/2021] #marriage: short date",
    "A free line that is not an entry",
  ].join("\r\n");

  test("keeps tagged events oldest first and says why other lines were ignored", () => {
    const memory = parseMemory(text);
    expect(
      memory.events.map((entry) => [entry.line, entry.date, entry.event.id, entry.message]),
    ).toEqual([
      [8, "2019-02-20", "marriage", "Married: registry, then ceremony"],
      [6, "2022-11-12", "child-birth", "First child"],
    ]);
    expect(memory.events.map((entry) => DateTime.formatIso(entry.noonUtc))).toEqual([
      "2019-02-20T12:00:00.000Z",
      "2022-11-12T12:00:00.000Z",
    ]);
    expect(memory.ignored).toEqual([
      { line: 7, reason: "untagged" },
      { line: 9, reason: "malformed" },
      { line: 10, reason: "unknown-event" },
      { line: 11, reason: "malformed" },
    ]);
  });

  test("an empty or header-only file is an empty memory", () => {
    expect(parseMemory("")).toEqual({ events: [], ignored: [] });
    expect(parseMemory("---\nname: Ada\n---\n")).toEqual({ events: [], ignored: [] });
  });
});

function factsWith(significators: ReadonlyArray<Planet>, subLordHouses: ReadonlyArray<House>) {
  const levels = (planet: Planet): Levels<House> => ({
    level1: [
      ...(significators.includes(planet) ? ([7] as const) : []),
      ...(planet === "Sun" ? subLordHouses : []),
    ],
    level2: [],
    level3: [],
    level4: [],
  });
  const planetSignifications = Object.fromEntries(
    KP_PLANETS.map((planet) => [planet, levels(planet)]),
  ) as unknown as Record<Planet, Levels<House>>;
  return {
    planetSignifications,
    houseSignificators: Object.fromEntries(
      KP_HOUSES.map((house) => [
        house,
        {
          level1: KP_PLANETS.filter((planet) =>
            planetSignifications[planet].level1.includes(house),
          ),
          level2: [],
          level3: [],
          level4: [],
        },
      ]),
    ) as unknown as Record<House, Levels<Planet>>,
    cuspSubLords: Object.fromEntries(KP_HOUSES.map((house) => [house, "Sun"])) as unknown as Record<
      House,
      Planet
    >,
    planetStarLords: Object.fromEntries(
      KP_PLANETS.map((planet, index) => [planet, KP_PLANETS[(index + 1) % KP_PLANETS.length]]),
    ) as unknown as Record<Planet, Planet>,
    planetSubLords: Object.fromEntries(
      KP_PLANETS.map((planet) => [planet, planet]),
    ) as unknown as Record<Planet, Planet>,
  } satisfies KpFacts;
}

const periods: ReadonlyArray<KpPeriod> = [
  { dasha: "Moon", bhukti: "Moon", antara: "Mars", start: at(0), end: at(100) },
  { dasha: "Moon", bhukti: "Moon", antara: "Saturn", start: at(100), end: at(400) },
];
const span = { from: at(0), to: at(400) };
const past = (millis: number) => ({ date: "2000-01-01", noonUtc: at(millis), event: marriage });

describe("hindcast", () => {
  const facts = factsWith(["Moon", "Mars"], [7]);

  test("a past event inside a conjoined period scores both points", () => {
    const fit = fitPastEvent(facts, periods, past(50), span);
    expect(fit).toEqual({
      date: "2000-01-01",
      event: "marriage",
      verdict: "promised",
      inConjoinedPeriod: true,
      lords: ["Moon", "Moon", "Mars"],
      conjoinedShareOfLife: 0.25,
    });
    expect(scoreFit(fit)).toBe(2);
  });

  test("outside a conjoined period, or against a denying sub lord, it scores less", () => {
    expect(scoreFit(fitPastEvent(facts, periods, past(200), span))).toBe(1);
    const denying = factsWith(["Moon", "Mars"], [6]);
    const fit = fitPastEvent(denying, periods, past(200), span);
    expect(fit.verdict).toBe("denied");
    expect(scoreFit(fit)).toBe(0);
  });

  test("coverage is the share of the span the conjoined periods fill", () => {
    const all = factsWith(["Moon", "Mars", "Saturn"], [7]);
    expect(fitPastEvent(all, periods, past(50), span).conjoinedShareOfLife).toBe(1);
  });
});

describe("birth-time check", () => {
  const trials = (scores: ReadonlyArray<number>) =>
    scores.map((score, index) => ({ offsetMinutes: index - 2, score }));

  test("needs three past events", () => {
    expect(checkBirthTime([], 2, 15)).toMatchObject({ status: "unverified", pastEvents: 2 });
  });

  test("can be switched off", () => {
    expect(checkBirthTime([], 5, 0).status).toBe("unverified");
  });

  test("all trials equal: the events cannot tell the moments apart", () => {
    expect(checkBirthTime(trials([4, 4, 4, 4, 4]), 3, 2).status).toBe("uninformative");
  });

  test("recorded moment among the best: consistent", () => {
    expect(checkBirthTime(trials([2, 6, 6, 3, 1]), 3, 2)).toMatchObject({
      status: "consistent",
      recordedScore: Option.some(6),
      bestScore: Option.some(6),
      bestOffsets: Option.some([-1, 0]),
    });
  });

  test("one better trial: suspect with a provisional offset", () => {
    expect(checkBirthTime(trials([2, 3, 4, 6, 1]), 3, 2)).toMatchObject({
      status: "suspect",
      provisionalOffsetMinutes: Option.some(1),
    });
  });

  test("several better trials: suspect, no offset chosen", () => {
    const result = checkBirthTime(trials([6, 3, 4, 6, 1]), 3, 2);
    expect(result.status).toBe("suspect");
    expect(Option.isNone(result.provisionalOffsetMinutes)).toBe(true);
    expect(Option.getOrThrow(result.bestOffsets)).toEqual([-2, 1]);
  });
});

describe("confidence with memory", () => {
  const base: Confidence = {
    level: "moderate",
    calibrated: false,
    basis: ["Birth time not verified", "Transit and sookshma refinement not applied"],
  };
  const fit = (overrides: Partial<Fit>): Fit => ({
    date: "2000-01-01",
    event: "marriage",
    verdict: "promised",
    inConjoinedPeriod: true,
    lords: [],
    conjoinedShareOfLife: 0.3,
    ...overrides,
  });

  test("a consistent birth time replaces the unverified note", () => {
    const result = confidenceWithMemory(
      base,
      checkBirthTime(
        [
          { offsetMinutes: -1, score: 1 },
          { offsetMinutes: 0, score: 6 },
        ],
        3,
        1,
      ),
      [fit({})],
    );
    expect(result.level).toBe("moderate");
    expect(result.basis).toEqual([
      "Birth time consistent with 3 past events within 1 minutes",
      "Transit and sookshma refinement not applied",
    ]);
  });

  test("an empty memory keeps the level and says why the birth time is unverified", () => {
    const result = confidenceWithMemory(base, checkBirthTime([], 0, 15), []);
    expect(result.level).toBe("moderate");
    expect(result.basis[0]).toBe(
      "Birth time not verified: The birth time is checked only with three or more past events",
    );
  });

  test("a denied or mistimed past event lowers confidence", () => {
    const unverified = checkBirthTime([], 1, 15);
    expect(confidenceWithMemory(base, unverified, [fit({ verdict: "denied" })]).level).toBe("low");
    expect(confidenceWithMemory(base, unverified, [fit({ inConjoinedPeriod: false })]).level).toBe(
      "low",
    );
  });

  test("hits under near-total coverage are called weak evidence", () => {
    const result = confidenceWithMemory(base, checkBirthTime([], 1, 15), [
      fit({ conjoinedShareOfLife: 0.95 }),
    ]);
    expect(result.level).toBe("moderate");
    expect(result.basis.at(-1)).toContain("weak evidence");
  });
});

const everyLordInMoonStar: Sky = {
  stepDays: 1,
  samples: [
    {
      at: at(0),
      starLords: Object.fromEntries(
        KP_PLANETS.map((planet) => [planet, "Moon"]),
      ) as unknown as Record<Planet, Planet>,
    },
  ],
};

describe("once-only events", () => {
  const facts = factsWith(["Moon", "Mars"], [7]);
  const options = {
    from: at(0),
    to: at(400),
    limit: 3,
    rulingPlanets: Option.none<ReadonlyArray<Planet>>(),
    occurred: [],
  };

  test("a recorded marriage stops marriage windows", () => {
    expect(judgeKp(facts, marriage, periods, everyLordInMoonStar, options).timing.status).toBe(
      "windows",
    );
    const judged = judgeKp(facts, marriage, periods, everyLordInMoonStar, {
      ...options,
      occurred: [at(50)],
    });
    expect(judged.timing).toMatchObject({ status: "already-occurred", windows: [] });
    expect(judged.promise.verdict).toBe("promised");
  });

  test("a repeatable event is still timed after it has happened", () => {
    const travel = Option.getOrThrow(findKpEvent("foreign-travel"));
    const judged = judgeKp(
      factsWith(["Moon", "Mars"], [12]),
      travel,
      periods,
      everyLordInMoonStar,
      {
        ...options,
        occurred: [at(50)],
      },
    );
    expect(judged.timing.status).not.toBe("already-occurred");
  });
});

describe("judge workflow with memory", () => {
  const input = {
    name: "Memory Subject",
    event: "marriage",
    from: "2026-01-01T00:00:00+05:30",
    years: 5,
  };
  const run = (raw: unknown) =>
    Effect.runPromise(decodeInput(JudgeInput, raw, "help").pipe(Effect.flatMap(judge)));

  test("empty memory, then tagged events: deterministic, and the memory used is listed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ascendant-memory-"));
    const previous = process.cwd();
    process.chdir(workspace);
    try {
      await Effect.runPromise(
        addPersonFromInput(
          Schema.decodeUnknownSync(PersonName)(input.name),
          Schema.decodeUnknownSync(OffsetMoment)("1990-01-01T12:00:00+05:30"),
          Schema.decodeUnknownSync(Latitude)(12.9716),
          Schema.decodeUnknownSync(Longitude)(77.5946),
        ).pipe(Effect.provide(AppLayer)),
      );

      const empty = await run(input);
      expect(empty.memory).toMatchObject({
        file: "persons/Memory Subject/MEMORY.md",
        status: "empty",
        used: [],
        birthTime: { status: "unverified" },
      });
      const ignored = await run({ ...input, useMemory: false });
      expect(ignored.memory).toEqual({ status: "not-used" });
      expect(ignored.promise).toEqual(empty.promise);
      expect(ignored.timing).toEqual(empty.timing);

      await appendFile(
        join("persons", input.name, "MEMORY.md"),
        [
          "- [15/06/2008]: Moved school",
          "- [10/07/2012] #higher-education: Started university",
          "- [01/08/2015] #service-or-business: First job",
          "- [20/02/2019] #marriage: Married",
          "",
        ].join("\n"),
      );

      const first = await run(input);
      const second = await run(input);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(first.memory).toMatchObject({ status: "used", ignored: [{ reason: "untagged" }] });
      if (first.memory.status !== "used") throw new Error("memory not used");
      expect(first.memory.used.map((entry) => entry.event)).toEqual([
        "higher-education",
        "service-or-business",
        "marriage",
      ]);
      expect(first.memory.hindcast).toHaveLength(3);
      expect(first.memory.birthTime).toMatchObject({ pastEvents: 3, windowMinutes: 15 });
      expect(first.memory.birthTime.status).not.toBe("unverified");
      expect(first.timing.status).toBe("already-occurred");
      expect(first.promise).toEqual(empty.promise);

      const unchecked = await run({ ...input, rectifyMinutes: 0 });
      expect(unchecked.memory).toMatchObject({ birthTime: { status: "unverified" } });
    } finally {
      process.chdir(previous);
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
