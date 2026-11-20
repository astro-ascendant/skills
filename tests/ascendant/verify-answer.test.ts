import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";

import { EvidenceInput, VerifyInput } from "../../skills/ascendant/tools/tool-specs.ts";
import {
  dateMentions,
  DISCLAIMER,
  rankingFault,
  verifyAnswer,
  type VerifiableFacts,
  type Worksheet,
} from "../../skills/ascendant/tools/verify-answer.ts";
import { decodeInput, evidence, verify } from "../../skills/ascendant/tools/workflows.ts";
import { addPersonNamed, inTempWorkspace } from "../support.ts";

const utc = (iso: string): DateTime.Utc => DateTime.makeUnsafe(iso);

const facts: VerifiableFacts = {
  coverage: [Option.some([])],
  knownFactIds: ["kp.cusp.7", "par.house.7", "par.planet.Venus"],
  periods: [
    {
      id: "Moon-Venus",
      start: utc("2030-11-16T18:30:00Z"),
      end: utc("2031-05-27T16:03:00Z"),
      running: false,
    },
    {
      id: "Moon-Sun",
      start: utc("2031-05-27T16:03:00Z"),
      end: utc("2031-11-26T16:03:00Z"),
      running: false,
    },
    {
      id: "Moon-Mars",
      start: utc("2028-01-01T00:00:00Z"),
      end: utc("2028-06-01T00:00:00Z"),
      running: true,
    },
  ],
  citableMoments: [utc("1990-01-01T06:30:00Z"), utc("2019-02-20T12:00:00Z")],
};

type Candidates = NonNullable<Worksheet["parts"][number]["candidates"]>;

const candidates: Candidates = [
  {
    periods: ["Moon-Venus"],
    chart: "strong",
    practicality: "ordinary",
    for: ["kp.cusp.7"],
    against: [],
    chosen: true,
  },
  {
    periods: ["Moon-Sun"],
    chart: "fair",
    practicality: "ordinary",
    for: ["par.house.7"],
    against: [],
  },
];

const untimed = { periods: [], candidates: [] };

const worksheet = (part: Partial<Worksheet["parts"][number]> = {}): Worksheet => ({
  parts: [
    {
      question: "When will she marry?",
      answer: "Between November 2030 and May 2031",
      reasoning: "Both readings tie the seventh house to this period, against a weak Venus.",
      for: ["kp.cusp.7", "par.house.7"],
      against: ["par.planet.Venus"],
      periods: ["Moon-Venus"],
      candidates,
      confidence: "moderate",
      ...part,
    },
  ],
});

const answer = (text: string) => `${text}\n\n${DISCLAIMER}\n`;

const withRecord: VerifiableFacts = { ...facts, knownFactIds: [...facts.knownFactIds, "memory.5"] };

const problemKinds = (draft: string, sheet: Worksheet = worksheet(), known = facts) =>
  verifyAnswer(draft, sheet, known).problems.map((problem) => problem.kind);

describe("date mentions", () => {
  it("reads days, months and bare years, each once", () => {
    const spans = dateMentions(
      "On 2031-03-04, then 5th March 2031, March 6, 2031, in April 2031, and again in 2032.",
    ).map((mention) => [
      mention.text,
      DateTime.formatIsoDateUtc(mention.start),
      DateTime.formatIsoDateUtc(mention.end),
    ]);
    expect(spans).toEqual([
      ["2031-03-04", "2031-03-04", "2031-03-05"],
      ["5th March 2031", "2031-03-05", "2031-03-06"],
      ["March 6, 2031", "2031-03-06", "2031-03-07"],
      ["April 2031", "2031-04-01", "2031-05-01"],
      ["2032", "2032-01-01", "2033-01-01"],
    ]);
  });

  it("ignores numbers that are not years and dates that do not exist", () => {
    expect(dateMentions("She is 31, earns 2500, and 2031-02-31 never happened.")).toEqual([]);
  });
});

describe("verify answer", () => {
  it("passes a draft whose facts, period and dates all hold", () => {
    expect(
      verifyAnswer(
        answer("I see marriage most likely between November 2030 and May 2031."),
        worksheet(),
        facts,
      ),
    ).toEqual({ ok: true, factsChecked: 3, periodsChecked: 2, datesChecked: 2, problems: [] });
  });

  it("allows recorded dates and a one-day shift from local time", () => {
    expect(
      problemKinds(
        answer("Born in 1990 and married on 20 February 2019. A window opens 15 November 2030."),
      ),
    ).toEqual([]);
  });

  it("flags a fact or period that does not belong to this person", () => {
    expect(
      verifyAnswer(
        answer("I see marriage."),
        worksheet({ for: ["kp.cusp.7", "kp.cusp.13"], periods: ["Moon-Pluto"] }),
        facts,
      ).problems.map((problem) => problem.detail),
    ).toEqual([
      '"kp.cusp.13" is not a fact of this chart; cite ids exactly as the evidence gives them',
      '"Moon-Pluto" is not a period of this person; use period ids exactly as the evidence gives them, with their kp: or par: calendar',
    ]);
  });

  it("flags a date outside every chosen period and record", () => {
    expect(
      verifyAnswer(
        answer("I see marriage in March 2029, or by 2033."),
        worksheet(),
        facts,
      ).problems.map((problem) => problem.detail),
    ).toEqual([
      '"March 2029" is in no period the worksheet chose and is not a recorded date',
      '"2033" is in no period the worksheet chose and is not a recorded date',
    ]);
  });

  it("flags reasoning with no evidence, and high confidence with nothing against", () => {
    expect(problemKinds(answer("I see marriage."), { parts: [] })).toEqual(["empty-worksheet"]);
    expect(
      problemKinds(
        answer("I see marriage."),
        worksheet({ for: [], against: [], ...untimed, confidence: "low" }),
      ),
    ).toEqual(["no-evidence"]);
    expect(
      problemKinds(
        answer("I see marriage."),
        worksheet({
          for: ["kp.cusp.7", "par.house.7", "memory.5"],
          against: [],
          confidence: "high",
        }),
        withRecord,
      ),
    ).toEqual(["one-sided"]);
    expect(
      problemKinds(answer("I see marriage."), worksheet({ reasoning: "Looks right." })),
    ).toEqual(["no-reasoning"]);
  });

  it("flags confidence the cited evidence cannot carry", () => {
    const details = (part: Partial<Worksheet["parts"][number]>) =>
      verifyAnswer(answer("I see marriage."), worksheet(part), facts).problems.map(
        (problem) => problem.detail,
      );
    expect(details({ for: ["kp.cusp.7"], against: [] })).toEqual([
      '"When will she marry?" claims moderate confidence but cites one school only; cite KP and Parashari facts, or say low',
    ]);
    expect(details({ confidence: "high" })).toEqual([
      '"When will she marry?" claims high confidence with no recorded past event behind it; cite one, or say moderate',
    ]);
    expect(details({ for: ["kp.cusp.7"], against: [], confidence: "low" })).toEqual([]);
  });

  it("lets Parashari lead a part that is not about timing", () => {
    const details = (part: Partial<Worksheet["parts"][number]>) =>
      verifyAnswer(answer("I see marriage."), worksheet({ ...untimed, ...part }), {
        ...facts,
        knownFactIds: [...facts.knownFactIds, "d9.planet.Venus"],
      }).problems.map((problem) => problem.detail);
    expect(details({ for: ["kp.cusp.7"], against: [], confidence: "low" })).toEqual([
      '"When will she marry?" is not about timing, so the Parashari reading leads; cite the Parashari facts it rests on',
    ]);
    expect(details({ for: ["par.house.7"], against: ["par.planet.Venus"] })).toEqual([
      '"When will she marry?" claims moderate confidence from the birth chart alone; confirm it with a divisional chart, a Jaimini fact or a KP fact, or say low',
    ]);
    expect(details({ for: ["par.house.7", "d9.planet.Venus"], against: [] })).toEqual([]);
    expect(details({ for: ["par.house.7"], against: [], confidence: "low" })).toEqual([]);
  });

  it("flags timing that ignores the recorded past events", () => {
    const kinds = (sheet: Worksheet) => problemKinds(answer("I see marriage."), sheet, withRecord);
    expect(kinds(worksheet())).toEqual(["record-not-used"]);
    expect(kinds(worksheet({ against: ["par.planet.Venus", "memory.5"] }))).toEqual([]);
    expect(kinds(worksheet(untimed))).toEqual([]);
    expect(problemKinds(answer("I see marriage."))).toEqual([]);
  });

  it("asks for at least two candidates when a period is picked", () => {
    const kinds = (part: Partial<Worksheet["parts"][number]>) =>
      problemKinds(answer("I see marriage."), worksheet(part));
    expect(kinds({ candidates: [] })).toEqual(["candidates-missing"]);
    expect(kinds({ candidates: candidates.slice(0, 1) })).toEqual(["candidates-missing"]);
    expect(kinds({ periods: ["Moon-Mars"], candidates: [] })).toEqual([]);
    expect(
      kinds({
        candidates: [
          ...candidates,
          { periods: ["Moon-Mars"], chart: "weak", practicality: "ordinary", for: [], against: [] },
        ],
      }),
    ).toEqual(["no-evidence"]);
  });

  it("asks for a candidate from every larger period in the stretch searched", () => {
    const block = (id: string, start: string, end: string) => ({
      id,
      start: utc(start),
      end: utc(end),
    });
    const details = (coverage: VerifiableFacts["coverage"]) =>
      verifyAnswer(answer("I see marriage."), worksheet(), { ...facts, coverage }).problems.map(
        (problem) => problem.detail,
      );
    expect(details([Option.none()])).toEqual([
      '"When will she marry?" does not say which stretch of life was searched; give searched.from and searched.to as YYYY-MM-DD',
    ]);
    expect(
      details([
        Option.some([
          block("kp:Moon-Venus", "2030-11-16T18:30:00Z", "2031-05-27T16:03:00Z"),
          block("kp:Moon-Sun", "2031-05-27T16:03:00Z", "2031-11-26T16:03:00Z"),
        ]),
      ]),
    ).toEqual([]);
    expect(
      details([
        Option.some([
          block("kp:Moon-Venus", "2030-11-16T18:30:00Z", "2031-05-27T16:03:00Z"),
          block("kp:Mars-Mars", "2032-01-01T00:00:00Z", "2032-06-01T00:00:00Z"),
          block("kp:Mars-Rahu", "2032-06-01T00:00:00Z", "2033-06-01T00:00:00Z"),
        ]),
      ]),
    ).toEqual([
      '"When will she marry?" compares no candidate from kp:Mars-Mars, kp:Mars-Rahu; every larger period in the stretch searched needs one, even when its main lord looks weak',
    ]);
    expect(
      problemKinds(answer("I see marriage."), worksheet(untimed), {
        ...facts,
        coverage: [Option.none()],
      }),
    ).toEqual([]);
  });

  it("keeps each school's evidence on its own calendar", () => {
    const kinds = (periods: ReadonlyArray<string>, cited: ReadonlyArray<string>) =>
      problemKinds(
        answer("I see marriage."),
        worksheet({
          candidates: [
            { ...candidates[0], periods, for: cited } as Candidates[number],
            candidates[1] as Candidates[number],
          ],
        }),
        {
          ...facts,
          periods: [
            ...facts.periods,
            { ...facts.periods[0], id: "kp:Moon-Venus" } as VerifiableFacts["periods"][number],
            { ...facts.periods[0], id: "par:Moon-Venus" } as VerifiableFacts["periods"][number],
          ],
        },
      );
    expect(kinds(["kp:Moon-Venus"], ["kp.cusp.7"])).toEqual([]);
    expect(kinds(["kp:Moon-Venus"], ["par.house.7"])).toEqual(["schools-mixed"]);
    expect(kinds(["par:Moon-Venus"], ["kp.cusp.7"])).toEqual(["schools-mixed"]);
    expect(kinds(["kp:Moon-Venus", "par:Moon-Venus"], ["kp.cusp.7", "par.house.7"])).toEqual([]);
  });

  it("lets ordinary life remove candidates and the chart rank the rest", () => {
    const one = (
      chart: Candidates[number]["chart"],
      practicality: Candidates[number]["practicality"],
      chosen = false,
    ): Candidates[number] => ({
      periods: ["Moon-Venus"],
      chart,
      practicality,
      for: ["x"],
      against: [],
      chosen,
    });
    const fault = (list: Candidates) => Option.getOrElse(rankingFault(list), () => "none");

    expect(fault([one("strong", "ordinary", true), one("fair", "ordinary")])).toBe("none");
    expect(fault([one("fair", "ordinary", true), one("fair", "ordinary")])).toBe("none");
    expect(fault([one("fair", "ordinary", true), one("strong", "ordinary")])).toMatch(
      /^another candidate/,
    );
    expect(fault([one("strong", "impossible", true), one("weak", "ordinary")])).toMatch(
      /impossible/,
    );
    expect(fault([one("fair", "unusual", true), one("fair", "ordinary")])).toMatch(/unusual/);
    expect(fault([one("strong", "unusual", true), one("fair", "ordinary")])).toBe("none");
    expect(fault([one("fair", "ordinary", true), one("strong", "unusual")])).toMatch(
      /^another candidate/,
    );
    expect(fault([one("fair", "ordinary", true), one("strong", "impossible")])).toBe("none");
    expect(fault([one("fair", "ordinary"), one("strong", "ordinary")])).toMatch(/exactly one/);
  });

  it("flags timing given without a date", () => {
    const kinds = (text: string) => problemKinds(answer(text));
    expect(kinds("It ended a few months earlier.")).toEqual(["vague-timing"]);
    expect(kinds("Over the coming months his attention turns to romance.")).toEqual([
      "vague-timing",
    ]);
    expect(kinds("It began in the middle of the period I gave earlier.")).toEqual(["vague-timing"]);
    expect(kinds("He was about 19, some months into the degree.")).toEqual([]);
  });

  it("flags a draft that talks about how the answer was produced", () => {
    expect(
      verifyAnswer(
        answer("The engine says marriage is indicated, per the worksheet."),
        worksheet(),
        facts,
      ).problems,
    ).toEqual([
      {
        kind: "process-wording",
        detail: '"The engine" talks about how the answer was produced; speak as the astrologer',
      },
    ]);
    expect(problemKinds(answer("I see marriage indicated; I cannot place the timing."))).toEqual(
      [],
    );
  });

  it("flags a missing disclaimer, certainty wording and long dashes", () => {
    expect(problemKinds("Marriage will definitely happen — in 2031.")).toEqual([
      "missing-disclaimer",
      "certainty-wording",
      "dash",
    ]);
  });
});

describe("evidence and verify workflows", () => {
  const name = "Verify Subject";
  const window = { from: "2010-01-01T00:00:00+05:30", to: "2014-01-01T00:00:00+05:30" };
  const isoDate = (iso: string) => iso.slice(0, 10);
  const monthAndYear = (iso: string) =>
    DateTime.formatUtc(utc(iso), { locale: "en-GB", month: "long", year: "numeric" });

  it.effect("accepts a draft built from the evidence and rejects one that drifts from it", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        yield* addPersonNamed(name);
        const found = yield* decodeInput(
          EvidenceInput,
          { name, event: "marriage", ...window },
          "help",
        ).pipe(Effect.flatMap(evidence));
        const ids = found.facts.map((fact) => fact.id);
        expect(ids).toContain("kp.rule.marriage");
        expect(ids).toContain("kp.cusp.7");
        expect(ids).not.toContain("kp.cusp.4");
        expect(ids).toContain("par.planet.Venus");
        expect(ids).toContain("d9.lagna");
        expect(found.periods.depth).toBe("bhukti");
        expect(found.transits.length).toBeGreaterThan(0);

        const period = found.periods.kp[1];
        const other = found.periods.kp[2];
        expect(period?.id).toMatch(/^kp:/);
        expect(found.periods.parashari[1]?.id).toMatch(/^par:/);
        const transit = found.transits[1];
        const pair: Candidates = [
          {
            periods: [period?.id ?? ""],
            chart: "strong",
            practicality: "ordinary",
            for: ["kp.cusp.7"],
            against: [],
            chosen: true,
          },
          {
            periods: [other?.id ?? ""],
            chart: "fair",
            practicality: "ordinary",
            for: ["kp.significators.7"],
            against: [],
          },
        ];

        expect(found.shortlist.unit).toBe("bhukti");
        expect(found.shortlist.kp.map((block) => block.id)).toContain(period?.id);
        expect(found.shortlist.kp[0]?.rows[0]?.id).toMatch(/^kp:[A-Za-z]+-[A-Za-z]+-[A-Za-z]+$/);
        expect(found.shortlist.parashari[0]?.id).toMatch(/^par:/);

        const compared = yield* decodeInput(
          EvidenceInput,
          { name, event: "marriage", compare: [period?.id ?? "", other?.id ?? ""] },
          "help",
        ).pipe(Effect.flatMap(evidence));
        expect(compared.candidates.map((row) => row.id)).toEqual([period?.id, other?.id]);
        expect(compared.candidates[0]?.lords.length).toBe(2);
        expect(compared.candidates[0]?.lords[0]).toMatch(/\(KP\)/);
        expect(compared.candidates[0]?.sameDatesInOtherCalendar[0]).toMatch(/^par:/);
        expect(compared.candidates[0]?.transits.length).toBeGreaterThan(0);
        const unknown = yield* Effect.exit(
          decodeInput(EvidenceInput, { name, compare: ["Moon-Pluto"] }, "help").pipe(
            Effect.flatMap(evidence),
          ),
        );
        expect(unknown._tag).toBe("Failure");
        expect(period).toBeDefined();
        const check = (draft: string, part: Partial<Worksheet["parts"][number]>) =>
          decodeInput(VerifyInput, { name, draft, worksheet: worksheet(part) }, "help").pipe(
            Effect.flatMap(verify),
          );

        const faithful = yield* check(
          answer(`I see a stronger stretch around ${monthAndYear(period?.start ?? "")}.`),
          {
            for: [
              "kp.rule.marriage",
              "kp.cusp.7",
              transit?.id ?? "",
              "jaimini.karaka.Darakaraka",
              "file:charts/D9.md",
            ],
            against: ["par.planet.Venus"],
            periods: [period?.id ?? ""],
            candidates: pair,
            searched: { from: isoDate(period?.start ?? ""), to: isoDate(other?.end ?? "") },
          },
        );
        expect(faithful).toMatchObject({ ok: true, factsChecked: 7, problems: [] });

        const drifted = yield* check(answer("I see marriage in 1850."), {
          for: ["kp.cusp.7", "transit.Jupiter.Aries.1850-01-01", "made.up", "file:nope.md"],
          against: [],
          periods: [period?.id ?? ""],
          candidates: pair,
          searched: { from: "1995-01-01", to: "2040-01-01" },
          confidence: "low",
        });
        expect(drifted.problems.map((problem) => problem.kind).sort()).toEqual([
          "coverage-missing",
          "date-not-in-period",
          "unknown-fact",
          "unknown-fact",
          "unknown-fact",
        ]);
      }),
    ),
  );

  it.effect("goes deeper only inside the stretch asked for, and needs both ends of it", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        yield* addPersonNamed(name);
        const ask = (extra: object) =>
          decodeInput(EvidenceInput, { name, houses: [10], ...extra }, "help").pipe(
            Effect.flatMap(evidence),
          );
        const none = yield* ask({});
        expect(none.periods.kp).toEqual([]);
        expect(none.periods.parashari).toEqual([]);
        expect(none.transits).toEqual([]);
        expect(none.running.periods).toEqual([]);

        const now = yield* ask({ at: "2012-03-10T00:00:00+05:30" });
        expect(now.running.periods.map((row) => row.id.split("-").length)).toEqual([
          1, 2, 3, 4, 1, 2, 3, 4,
        ]);
        expect(now.running.periods.map((row) => row.id.split(":")[0])).toEqual([
          "kp",
          "kp",
          "kp",
          "kp",
          "par",
          "par",
          "par",
          "par",
        ]);
        expect(now.running.transits.map((fact) => fact.id.split(".")[1])).toEqual([
          "Jupiter",
          "Saturn",
          "Rahu",
        ]);

        const month = { from: "2012-03-01T00:00:00+05:30", to: "2012-04-01T00:00:00+05:30" };
        const sookshma = yield* ask({ ...month, depth: "sookshma" });
        expect(sookshma.periods.kp.length).toBeGreaterThan(1);
        expect(sookshma.periods.kp.every((row) => row.id.split("-").length === 4)).toBe(true);

        const halfOpen = yield* Effect.exit(ask({ from: month.from }));
        expect(halfOpen._tag).toBe("Failure");
      }),
    ),
  );
});
