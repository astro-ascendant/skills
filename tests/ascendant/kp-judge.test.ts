import { mkdtemp, rm } from "node:fs/promises";
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
import { findKpEvent, type House, type KpEvent } from "../../skills/ascendant/tools/events.ts";
import {
  houseGroup,
  judgeKp,
  judgePromise,
  KP_HOUSES,
  KP_PLANETS,
  rankSignificators,
  timeEvent,
  type KpFacts,
  type KpPeriod,
  type Levels,
  type Sky,
  type Planet,
} from "../../skills/ascendant/tools/kp-judge.ts";
import { JudgeInput } from "../../skills/ascendant/tools/tool-specs.ts";
import { decodeInput, judge } from "../../skills/ascendant/tools/workflows.ts";

const event = (id: string): KpEvent => Option.getOrThrow(findKpEvent(id));

const at = (epochMillis: number): DateTime.Utc => DateTime.makeUnsafe(epochMillis);
const noRulingPlanets = Option.none<ReadonlyArray<Planet>>();

type Houses = Partial<Record<1 | 2 | 3 | 4, ReadonlyArray<House>>>;

interface FactsInput {
  readonly signifies?: Partial<Record<Planet, Houses>>;
  readonly cuspSubLords?: Partial<Record<House, Planet>>;
  readonly starLords?: Partial<Record<Planet, Planet>>;
  readonly subLords?: Partial<Record<Planet, Planet>>;
}

function makeFacts(input: FactsInput = {}): KpFacts {
  const planetSignifications = Object.fromEntries(
    KP_PLANETS.map((planet) => {
      const houses = input.signifies?.[planet] ?? {};
      return [
        planet,
        {
          level1: houses[1] ?? [],
          level2: houses[2] ?? [],
          level3: houses[3] ?? [],
          level4: houses[4] ?? [],
        },
      ];
    }),
  ) as unknown as Record<Planet, Levels<House>>;
  const significatorsAt = (house: House, level: keyof Levels<House>) =>
    KP_PLANETS.filter((planet) => planetSignifications[planet][level].includes(house));
  return {
    planetSignifications,
    houseSignificators: Object.fromEntries(
      KP_HOUSES.map((house) => [
        house,
        {
          level1: significatorsAt(house, "level1"),
          level2: significatorsAt(house, "level2"),
          level3: significatorsAt(house, "level3"),
          level4: significatorsAt(house, "level4"),
        },
      ]),
    ) as unknown as Record<House, Levels<Planet>>,
    cuspSubLords: Object.fromEntries(
      KP_HOUSES.map((house) => [house, input.cuspSubLords?.[house] ?? "Sun"]),
    ) as unknown as Record<House, Planet>,
    planetStarLords: Object.fromEntries(
      KP_PLANETS.map((planet, index) => [
        planet,
        input.starLords?.[planet] ?? KP_PLANETS[(index + 1) % KP_PLANETS.length],
      ]),
    ) as unknown as Record<Planet, Planet>,
    planetSubLords: Object.fromEntries(
      KP_PLANETS.map((planet) => [planet, input.subLords?.[planet] ?? planet]),
    ) as unknown as Record<Planet, Planet>,
  };
}

const marriage = event("marriage");
const marriageGroup = houseGroup(marriage);

describe("house group", () => {
  test("marriage: 2, 7, 11 conducive and their 12th houses detrimental", () => {
    expect(marriageGroup).toEqual({
      conducive: [2, 7, 11],
      parenthesised: [],
      detrimental: [1, 6, 10],
    });
  });

  test("a conducive house is never also detrimental", () => {
    expect(houseGroup(event("service-or-business"))).toEqual({
      conducive: [6, 7, 10],
      parenthesised: [],
      detrimental: [5, 9],
    });
  });

  test("parenthesised houses are optional, outside both groups", () => {
    expect(houseGroup(event("obtaining-loans"))).toEqual({
      conducive: [2, 11],
      parenthesised: [6],
      detrimental: [1, 10],
    });
  });
});

describe("promise", () => {
  const promise = (signifies: Houses, starLords?: Partial<Record<Planet, Planet>>) =>
    judgePromise(
      makeFacts({
        cuspSubLords: { 7: "Venus" },
        signifies: { Venus: signifies },
        ...(starLords !== undefined ? { starLords } : {}),
      }),
      marriage,
      marriageGroup,
    );

  test("sub lord signifying only conducive houses: promised", () => {
    const result = promise({ 1: [11], 3: [4] });
    expect(result.subLord).toBe("Venus");
    expect(result.verdict).toBe("promised");
    expect(result.rules.map((rule) => rule.rule)).toEqual(["promise.conducive-house"]);
  });

  test("sub lord signifying only detrimental houses: denied", () => {
    expect(promise({ 2: [6], 4: [10] }).verdict).toBe("denied");
  });

  test("sub lord signifying neither: not indicated, with the engine named as source", () => {
    const result = promise({ 1: [4], 2: [9] });
    expect(result.verdict).toBe("not-indicated");
    expect(result.rules.at(-1)).toMatchObject({
      rule: "promise.no-rule",
      source: { _tag: "Engine", choice: "neither-group-not-indicated" },
    });
  });

  test("mixed: the stronger level decides the lean", () => {
    expect(promise({ 1: [7], 3: [6] })).toMatchObject({
      verdict: "mixed",
      lean: "favourable",
    });
    expect(promise({ 1: [6], 3: [7] })).toMatchObject({
      verdict: "mixed",
      lean: "unfavourable",
    });
    expect(promise({ 2: [7, 6] })).toMatchObject({
      verdict: "mixed",
      lean: "balanced",
    });
  });

  test("a self-strength sub lord reads level 2 before level 1", () => {
    const tenanted = promise({ 1: [6], 2: [7] });
    expect(tenanted).toMatchObject({ selfStrength: false, lean: "unfavourable" });

    const selfStrength = promise({ 1: [6], 2: [7] }, { Jupiter: "Sun" });
    expect(selfStrength).toMatchObject({ selfStrength: true, lean: "favourable" });
    expect(selfStrength.rules[0]?.rule).toBe("promise.self-strength-order");
  });
});

describe("significators", () => {
  const facts = makeFacts({
    signifies: {
      Sun: { 2: [7] },
      Moon: { 1: [7], 3: [2] },
      Mars: { 1: [10], 3: [11] },
      Jupiter: { 4: [11] },
      Saturn: { 1: [5] },
    },
  });

  test("only planets signifying a conducive house are listed", () => {
    const ranked = rankSignificators(facts, marriageGroup, noRulingPlanets);
    expect(ranked.map((entry) => entry.planet)).toEqual(["Sun", "Moon", "Jupiter", "Mars"]);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  test("the cusp sub lord leads, then more houses, then the stronger level", () => {
    const ranked = rankSignificators(facts, marriageGroup, noRulingPlanets);
    expect(ranked[0]).toMatchObject({ planet: "Sun", criteria: ["is-cusp-sub-lord"] });
    expect(ranked[1]?.conduciveHouses).toEqual([
      { house: 2, level: 3 },
      { house: 7, level: 1 },
    ]);
  });

  test("a planet stronger for a detrimental house is ranked last, not removed", () => {
    const ranked = rankSignificators(facts, marriageGroup, noRulingPlanets);
    expect(ranked.at(-1)).toMatchObject({
      planet: "Mars",
      weakened: ["detrimental-house-at-stronger-level"],
    });
  });

  test("a ruling planet outranks the other criteria", () => {
    const ranked = rankSignificators(
      facts,
      marriageGroup,
      Option.some<ReadonlyArray<Planet>>(["Jupiter"]),
    );
    expect(ranked[0]).toMatchObject({ planet: "Jupiter", criteria: ["ruling-planet"] });
  });

  test("a significator in the sub of a purely detrimental planet is marked", () => {
    const ranked = rankSignificators(
      makeFacts({
        signifies: { Sun: { 1: [7] }, Saturn: { 1: [6] } },
        subLords: { Sun: "Saturn" },
      }),
      marriageGroup,
      noRulingPlanets,
    );
    expect(ranked).toMatchObject([
      { planet: "Sun", weakened: ["detrimental-sub-only-detrimental"] },
    ]);
  });
});

describe("timing", () => {
  const significators = rankSignificators(
    makeFacts({
      signifies: { Sun: { 1: [7] }, Moon: { 2: [7] }, Mars: { 3: [7] }, Jupiter: { 4: [7] } },
    }),
    marriageGroup,
    noRulingPlanets,
  );
  const period = (lords: readonly [Planet, Planet, Planet], start: number, end: number) => ({
    dasha: lords[0],
    bhukti: lords[1],
    antara: lords[2],
    start: at(start),
    end: at(end),
  });
  const periods: ReadonlyArray<KpPeriod> = [
    period(["Sun", "Moon", "Jupiter"], 0, 100),
    period(["Sun", "Moon", "Saturn"], 100, 200),
    period(["Sun", "Moon", "Mars"], 200, 300),
    period(["Sun", "Moon", "Moon"], 300, 400),
    period(["Sun", "Sun", "Sun"], 400, 500),
  ];

  const skyWhere = (
    samples: ReadonlyArray<readonly [number, Partial<Record<Planet, Planet>>]>,
  ): Sky => ({
    stepDays: 1,
    samples: samples.map(([millis, starLords]) => ({
      at: at(millis),
      starLords: Object.fromEntries(
        KP_PLANETS.map((planet) => [planet, starLords[planet] ?? "Sun"]),
      ) as unknown as Record<Planet, Planet>,
    })),
  });
  const everyLordInASignificatorStar = skyWhere([
    [0, {}],
    [100, {}],
    [200, {}],
    [300, {}],
    [400, {}],
  ]);
  const millisOf = (timing: ReturnType<typeof timeEvent>) =>
    timing.windows.map((window) => ({
      ...window,
      start: DateTime.toEpochMillis(window.start),
      end: DateTime.toEpochMillis(window.end),
    }));

  test("a conjoined period with a lord outside significator stars gives no window", () => {
    const sunInSaturnStar = skyWhere([
      [200, {}],
      [400, { Sun: "Saturn" }],
    ]);
    const timing = timeEvent(significators, periods, sunInSaturnStar, {
      from: at(0),
      to: at(500),
      limit: 3,
    });
    expect(timing.conjoinedPeriods).toBe(4);
    expect(millisOf(timing)).toEqual([
      { rank: 1, dasha: "Sun", bhukti: "Moon", antara: "Mars", start: 200, end: 300 },
    ]);
  });

  test("adjacent agreeing days in one period are one window", () => {
    const timing = timeEvent(
      significators,
      periods,
      skyWhere([
        [310, {}],
        [320, {}],
        [330, { Moon: "Saturn" }],
        [340, {}],
      ]),
      { from: at(0), to: at(500), limit: 3 },
    );
    expect(timing.foundBeforeLimit).toBe(2);
    expect(millisOf(timing).map((window) => window.start)).toEqual([310, 340]);
  });

  test("conjoined periods without transit agreement are reported, not timed", () => {
    const timing = timeEvent(significators, periods, skyWhere([[400, { Sun: "Saturn" }]]), {
      from: at(0),
      to: at(500),
      limit: 3,
    });
    expect(timing).toMatchObject({
      status: "no-transit-agreement",
      windows: [],
      conjoinedPeriods: 4,
    });
    expect(timing.rules.map((rule) => rule.rule)).toEqual([
      "timing.conjoined-period",
      "timing.no-transit-agreement",
    ]);
  });

  test("keeps periods whose three lords are all significators, strongest first", () => {
    const timing = timeEvent(significators, periods, everyLordInASignificatorStar, {
      from: at(0),
      to: at(450),
      limit: 3,
    });
    expect(timing.status).toBe("windows");
    expect(timing.foundBeforeLimit).toBe(4);
    expect(millisOf(timing)).toEqual([
      { rank: 1, dasha: "Sun", bhukti: "Sun", antara: "Sun", start: 400, end: 450 },
      { rank: 2, dasha: "Sun", bhukti: "Moon", antara: "Moon", start: 300, end: 400 },
      { rank: 3, dasha: "Sun", bhukti: "Moon", antara: "Mars", start: 200, end: 300 },
    ]);
  });

  test("reports the absence of a conjoined period", () => {
    const timing = timeEvent(significators, periods, everyLordInASignificatorStar, {
      from: at(100),
      to: at(200),
      limit: 3,
    });
    expect(timing).toMatchObject({
      status: "no-conjoined-period",
      windows: [],
      foundBeforeLimit: 0,
    });
  });

  test("a denied promise is not timed, and confidence is never above moderate", () => {
    const judgment = judgeKp(
      makeFacts({ cuspSubLords: { 7: "Venus" }, signifies: { Venus: { 1: [6] } } }),
      marriage,
      periods,
      everyLordInASignificatorStar,
      { from: at(0), to: at(500), limit: 3, rulingPlanets: noRulingPlanets, occurred: [] },
    );
    expect(judgment.promise.verdict).toBe("denied");
    expect(judgment.timing.status).toBe("skipped");
    expect(judgment.confidence).toMatchObject({ level: "moderate", calibrated: false });
  });
});

describe("judge workflow", () => {
  const input = {
    name: "Judge Subject",
    event: "marriage",
    from: "2026-01-01T00:00:00+05:30",
    years: 5,
  };
  const run = (raw: unknown) =>
    Effect.runPromise(decodeInput(JudgeInput, raw, "help").pipe(Effect.flatMap(judge)));

  test("the same input gives a byte-identical judgment", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ascendant-judge-"));
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
      const first = await run(input);
      const second = await run(input);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));

      expect(first.engine).toBe("kp-judge/4");
      expect(first.calculation).toMatchObject({
        school: "KP",
        ayanamsa: "KrishnamurtiVP291",
        houseSystem: "Placidus",
      });
      expect(first.event).toMatchObject({ conducive: [2, 7, 11], detrimental: [1, 6, 10] });
      expect(first.window).toEqual({
        from: "2025-12-31T18:30:00.000Z",
        to: "2031-01-01T00:30:00.000Z",
      });
      for (const window of first.timing.windows) {
        expect(window.start >= first.window.from && window.end <= first.window.to).toBe(true);
      }

      const withRulingPlanets = await run({
        ...input,
        judgmentMoment: "2026-09-23T10:00:00+05:30",
      });
      expect(withRulingPlanets.rulingPlanets?.planets.length).toBeGreaterThan(0);
      expect(withRulingPlanets.promise).toEqual(first.promise);
    } finally {
      process.chdir(previous);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("an unknown or refused event is a validation error", async () => {
    for (const refused of ["nope", "accident", "long-life"]) {
      const exit = await Effect.runPromiseExit(
        decodeInput(JudgeInput, { ...input, event: refused }, "help"),
      );
      expect(exit._tag).toBe("Failure");
    }
  });
});
