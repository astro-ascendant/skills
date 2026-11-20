import { Array as Arr, DateTime, Option, pipe, Schema } from "effect";

export const DISCLAIMER =
  "AI can be wrong. Please check the cited charts and references before deciding.";

export const ChartStrength = Schema.Literals(["weak", "fair", "strong"]);
export type ChartStrength = typeof ChartStrength.Type;

export const Practicality = Schema.Literals(["impossible", "unusual", "ordinary"]);
export type Practicality = typeof Practicality.Type;

export const Candidate = Schema.Struct({
  periods: Schema.Array(Schema.String),
  chart: ChartStrength,
  practicality: Practicality,
  for: Schema.Array(Schema.String),
  against: Schema.Array(Schema.String),
  chosen: Schema.optional(Schema.Boolean),
  adjusted: Schema.optional(Schema.String),
});
export interface Candidate extends Schema.Schema.Type<typeof Candidate> {}

export const WorksheetPart = Schema.Struct({
  question: Schema.String,
  answer: Schema.String,
  reasoning: Schema.String,
  for: Schema.Array(Schema.String),
  against: Schema.Array(Schema.String),
  periods: Schema.optional(Schema.Array(Schema.String)),
  candidates: Schema.optional(Schema.Array(Candidate)),
  searched: Schema.optional(Schema.Struct({ from: Schema.String, to: Schema.String })),
  topic: Schema.optional(
    Schema.Struct({
      event: Schema.optional(Schema.String),
      houses: Schema.optional(Schema.Array(Schema.Int)),
    }),
  ),
  depth: Schema.optional(Schema.Literals(["dasha", "bhukti", "antara", "sookshma"])),
  confidence: Schema.Literals(["low", "moderate", "high"]),
});
export interface WorksheetPart extends Schema.Schema.Type<typeof WorksheetPart> {}

export const Worksheet = Schema.Struct({
  asOf: Schema.optional(Schema.String),
  parts: Schema.Array(WorksheetPart),
});
export interface Worksheet extends Schema.Schema.Type<typeof Worksheet> {}

export const ProblemKind = Schema.Literals([
  "empty-worksheet",
  "no-evidence",
  "no-reasoning",
  "confidence-unsupported",
  "parashari-missing",
  "vague-timing",
  "record-not-used",
  "candidates-missing",
  "ranking-broken",
  "ranking-ignored",
  "rating-unexplained",
  "confidence-mismatch",
  "schools-mixed",
  "one-sided",
  "unknown-fact",
  "unknown-period",
  "date-not-in-period",
  "missing-disclaimer",
  "certainty-wording",
  "process-wording",
  "dash",
]);
export type ProblemKind = typeof ProblemKind.Type;

export const Problem = Schema.Struct({ kind: ProblemKind, detail: Schema.String });
export interface Problem extends Schema.Schema.Type<typeof Problem> {}

export const Verification = Schema.Struct({
  ok: Schema.Boolean,
  factsChecked: Schema.Int,
  periodsChecked: Schema.Int,
  datesChecked: Schema.Int,
  problems: Schema.Array(Problem),
});
export interface Verification extends Schema.Schema.Type<typeof Verification> {}

export interface ResolvedPeriod {
  readonly id: string;
  readonly start: DateTime.Utc;
  readonly end: DateTime.Utc;
  readonly running: boolean;
}

export interface RankedPeriod {
  readonly id: string;
  readonly rank: number;
  readonly rating: ChartStrength;
}

export interface VerifiableFacts {
  readonly ranking: ReadonlyArray<Option.Option<ReadonlyArray<RankedPeriod>>>;
  readonly knownFactIds: ReadonlyArray<string>;
  readonly periods: ReadonlyArray<ResolvedPeriod>;
  readonly citableMoments: ReadonlyArray<DateTime.Utc>;
}

interface Span {
  readonly start: DateTime.Utc;
  readonly end: DateTime.Utc;
}

interface DateMention extends Span {
  readonly text: string;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const MONTH = `(${MONTHS.join("|")})`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const YEAR = String.raw`((?:18|19|20|21)\d{2})`;

const DATE_MENTION = new RegExp(
  [
    String.raw`\b${YEAR}-(\d{2})-(\d{2})\b`,
    String.raw`\b${DAY} ${MONTH},? ${YEAR}\b`,
    String.raw`\b${MONTH} ${DAY},? ${YEAR}\b`,
    String.raw`\b${MONTH},? ${YEAR}\b`,
    String.raw`\b${YEAR}\b`,
  ].join("|"),
  "gi",
);

const monthNumber = (name: string): number => MONTHS.indexOf(name.toLowerCase() as never) + 1;

const isTheCalendarDate = (
  moment: DateTime.Utc,
  month: Option.Option<number>,
  day: Option.Option<number>,
): boolean => {
  const parts = DateTime.toPartsUtc(moment);
  return (
    Option.match(month, { onNone: () => true, onSome: (asked) => parts.month === asked }) &&
    Option.match(day, { onNone: () => true, onSome: (asked) => parts.day === asked })
  );
};

const spanOf = (
  year: number,
  month: Option.Option<number>,
  day: Option.Option<number>,
): Option.Option<Span> =>
  pipe(
    DateTime.make({
      year,
      month: Option.getOrElse(month, () => 1),
      day: Option.getOrElse(day, () => 1),
    }),
    Option.filter((start) => isTheCalendarDate(start, month, day)),
    Option.map((start) => ({
      start,
      end: DateTime.add(
        start,
        Option.isSome(day) ? { days: 1 } : Option.isSome(month) ? { months: 1 } : { years: 1 },
      ),
    })),
  );

const numberAt = (match: RegExpMatchArray, group: number): Option.Option<number> =>
  Option.map(Option.fromUndefinedOr(match[group]), Number);

const monthAt = (match: RegExpMatchArray, group: number): Option.Option<number> =>
  Option.map(Option.fromUndefinedOr(match[group]), monthNumber);

const firstSome = <A>(...options: ReadonlyArray<Option.Option<A>>): Option.Option<A> =>
  Option.firstSomeOf(options);

const mentionOf = (match: RegExpMatchArray): Option.Option<DateMention> =>
  pipe(
    firstSome(
      numberAt(match, 1),
      numberAt(match, 6),
      numberAt(match, 9),
      numberAt(match, 11),
      numberAt(match, 12),
    ),
    Option.flatMap((year) =>
      spanOf(
        year,
        firstSome(numberAt(match, 2), monthAt(match, 5), monthAt(match, 7), monthAt(match, 10)),
        firstSome(numberAt(match, 3), numberAt(match, 4), numberAt(match, 8)),
      ),
    ),
    Option.map((span) => ({ ...span, text: match[0] })),
  );

export const dateMentions = (draft: string): ReadonlyArray<DateMention> =>
  Arr.getSomes(Arr.map([...draft.matchAll(DATE_MENTION)], mentionOf));

const LOCAL_DATE_TOLERANCE = { days: 1 } as const;

const overlaps = (mention: Span, span: Span): boolean =>
  DateTime.isLessThan(DateTime.subtract(mention.start, LOCAL_DATE_TOLERANCE), span.end) &&
  DateTime.isGreaterThan(DateTime.add(mention.end, LOCAL_DATE_TOLERANCE), span.start);

const contains = (mention: Span, moment: DateTime.Utc): boolean =>
  overlaps(mention, { start: moment, end: moment });

const CERTAINTY_WORDING =
  /\b(definitely|certainly|guaranteed?|without (?:a )?doubt|for sure|100 ?%|bound to)\b/i;

const PROCESS_WORDING =
  /\b(the engine|engine's|the judge|verifier|verification|event ids?|fact ids?|period ids?|worksheet|tool calls?|the tool|the script|the skill)\b/i;

const VAGUE_TIMING =
  /\b(?:(?:a few|a couple of|several|some) (?:weeks|months|years) (?:earlier|later|before|after|ago)|(?:the )?(?:coming|next|following|last|past) (?:few |couple of )?(?:weeks|months|years)|(?:gave|said|read|mentioned) earlier|a (?:year|month) or (?:two|so))\b/i;

const SURE_WORDING =
  /\b(?:moderately|fairly|quite|reasonably|pretty|very|highly) (?:sure|confident|certain)\b|\b(?:moderate|high|good|strong) confidence\b/i;

const MIN_REASONING_LENGTH = 40;
const MIN_CANDIDATES = 2;
const TOP_RANKED = 3;

const KP_FACT = /^kp\./;
const PARASHARI_FACT = /^(?:par\.|d\d+\.|jaimini\.)/;
const RECORD_FACT = /^memory\./;

const BIRTH_CHART_FACT = /^par\./;
const SECOND_SOURCE_FACT = /^(?:kp\.|d\d+\.|jaimini\.)/;

const cites = (part: WorksheetPart, kind: RegExp): boolean =>
  Arr.some([...part.for, ...part.against], (id) => kind.test(id));

const citesAnything = (part: WorksheetPart): boolean => part.for.length + part.against.length > 0;

const isTimed = (part: WorksheetPart): boolean => (part.periods ?? []).length > 0;

const citesBothSchools = (part: WorksheetPart): boolean => {
  const cited = [...part.for, ...part.against];
  return (
    Arr.some(cited, (id) => KP_FACT.test(id)) && Arr.some(cited, (id) => PARASHARI_FACT.test(id))
  );
};

const candidatesOf = (part: WorksheetPart): ReadonlyArray<Candidate> => part.candidates ?? [];

const citedIn = (part: WorksheetPart): ReadonlyArray<string> => [
  ...part.for,
  ...part.against,
  ...Arr.flatMap(candidatesOf(part), (candidate) => [...candidate.for, ...candidate.against]),
];

const periodsIn = (part: WorksheetPart): ReadonlyArray<string> => [
  ...(part.periods ?? []),
  ...Arr.flatMap(candidatesOf(part), (candidate) => candidate.periods),
];

const citesTheRecord = (part: WorksheetPart): boolean =>
  Arr.some(citedIn(part), (id) => RECORD_FACT.test(id));

const KP_PERIOD = /^kp:/;
const PARASHARI_PERIOD = /^par:/;

const strayFact = (candidate: Candidate): Option.Option<string> => {
  const onKp = Arr.some(candidate.periods, (id) => KP_PERIOD.test(id));
  const onParashari = Arr.some(candidate.periods, (id) => PARASHARI_PERIOD.test(id));
  return Arr.findFirst(
    [...candidate.for, ...candidate.against],
    (id) =>
      (onKp && !onParashari && PARASHARI_FACT.test(id)) ||
      (onParashari && !onKp && KP_FACT.test(id)),
  );
};

const CHART_RANK: Readonly<Record<ChartStrength, number>> = { weak: 0, fair: 1, strong: 2 };

const strongestOrdinary = (candidates: ReadonlyArray<Candidate>): number =>
  Arr.reduce(
    Arr.filter(candidates, (candidate) => candidate.practicality === "ordinary"),
    -1,
    (strongest, candidate) => Math.max(strongest, CHART_RANK[candidate.chart]),
  );

const staysIn = (candidate: Candidate, candidates: ReadonlyArray<Candidate>): boolean =>
  candidate.practicality === "ordinary" ||
  (candidate.practicality === "unusual" &&
    CHART_RANK[candidate.chart] > strongestOrdinary(candidates));

export const rankingFault = (candidates: ReadonlyArray<Candidate>): Option.Option<string> => {
  const chosen = Arr.filter(candidates, (candidate) => candidate.chosen === true);
  const pick = chosen[0];
  if (chosen.length !== 1 || pick === undefined) {
    return Option.some("mark exactly one candidate as chosen");
  }
  if (pick.practicality === "impossible") {
    return Option.some("the chosen candidate is rated impossible in ordinary life");
  }
  if (!staysIn(pick, candidates)) {
    return Option.some(
      "the chosen candidate is unusual in ordinary life, so its chart rating must be higher than every ordinary candidate's",
    );
  }
  return Arr.some(
    candidates,
    (other) => staysIn(other, candidates) && CHART_RANK[other.chart] > CHART_RANK[pick.chart],
  )
    ? Option.some(
        "another candidate that ordinary life allows has a stronger chart rating; ordinary life only removes candidates, the chart ranks the rest",
      )
    : Option.none();
};

const LONG_DASH = /[–—]/;

const when = (holds: boolean, problem: () => Problem): Option.Option<Problem> =>
  holds ? Option.some(problem()) : Option.none();

export function verifyAnswer(
  draft: string,
  worksheet: Worksheet,
  facts: VerifiableFacts,
): Verification {
  const cited = Arr.dedupe(Arr.flatMap(worksheet.parts, citedIn));
  const chosen = Arr.dedupe(Arr.flatMap(worksheet.parts, periodsIn));
  const isRunning = (id: string): boolean =>
    Arr.some(facts.periods, (period) => period.id === id && period.running);
  const choosesAPeriod = (part: WorksheetPart): boolean =>
    candidatesOf(part).length > 0 || Arr.some(part.periods ?? [], (id) => !isRunning(id));

  const rankingProblems = (
    part: WorksheetPart,
    partIndex: number,
  ): ReadonlyArray<Option.Option<Problem>> => {
    if (candidatesOf(part).length < MIN_CANDIDATES) return [];
    return Option.match(Option.flatten(Arr.get(facts.ranking, partIndex)), {
      onNone: () => [
        Option.some<Problem>({
          kind: "ranking-ignored",
          detail: `"${part.question}" cannot be compared with the ranking; give searched (from and to as YYYY-MM-DD), topic (the event id or houses you asked the evidence for) and depth`,
        }),
      ],
      onSome: (ranked) => {
        const listed = Arr.flatMap(candidatesOf(part), (candidate) => candidate.periods);
        const missing = pipe(
          ranked,
          Arr.filter((row) => row.rank <= TOP_RANKED && !Arr.contains(listed, row.id)),
          Arr.map((row) => row.id),
        );
        return [
          when(missing.length > 0, () => ({
            kind: "ranking-ignored",
            detail: `"${part.question}" leaves out ${missing.join(", ")}; the ${TOP_RANKED} strongest windows of the ranking must be among the candidates`,
          })),
          ...Arr.flatMap(candidatesOf(part), (candidate) =>
            pipe(
              Arr.findFirst(ranked, (row) => Arr.contains(candidate.periods, row.id)),
              Option.match({
                onNone: () => [],
                onSome: (row) => {
                  const moved = Math.abs(CHART_RANK[candidate.chart] - CHART_RANK[row.rating]);
                  return [
                    when(moved > 1, () => ({
                      kind: "rating-unexplained",
                      detail: `"${part.question}" rates ${row.id} ${candidate.chart} where the ranking gives ${row.rating}; a rating may move one step at most`,
                    })),
                    when(
                      moved === 1 &&
                        (candidate.adjusted ?? "").trim().length < MIN_REASONING_LENGTH,
                      () => ({
                        kind: "rating-unexplained",
                        detail: `"${part.question}" rates ${row.id} ${candidate.chart} where the ranking gives ${row.rating}; say in adjusted what the ranking does not count that justifies the change, or use its rating`,
                      }),
                    ),
                  ];
                },
              }),
            ),
          ),
        ];
      },
    });
  };

  const worksheetProblems = Arr.getSomes<ReadonlyArray<Option.Option<Problem>>>([
    when(worksheet.parts.length === 0, () => ({
      kind: "empty-worksheet",
      detail: "The worksheet has no parts; every part of the question needs one",
    })),
    ...Arr.flatMap(worksheet.parts, (part, partIndex) => [
      ...rankingProblems(part, partIndex),
      when(part.for.length + part.against.length === 0, () => ({
        kind: "no-evidence",
        detail: `"${part.question}" cites no fact; an answer needs evidence from the chart`,
      })),
      when(part.reasoning.trim().length < MIN_REASONING_LENGTH, () => ({
        kind: "no-reasoning",
        detail: `"${part.question}" does not say how the evidence was weighed; give the reasoning in a sentence or two`,
      })),
      when(!isTimed(part) && citesAnything(part) && !cites(part, PARASHARI_FACT), () => ({
        kind: "parashari-missing",
        detail: `"${part.question}" is not about timing, so the Parashari reading leads; cite the Parashari facts it rests on`,
      })),
      when(isTimed(part) && part.confidence !== "low" && !citesBothSchools(part), () => ({
        kind: "confidence-unsupported",
        detail: `"${part.question}" claims ${part.confidence} confidence but cites one school only; cite KP and Parashari facts, or say low`,
      })),
      when(
        !isTimed(part) &&
          part.confidence !== "low" &&
          cites(part, BIRTH_CHART_FACT) &&
          !cites(part, SECOND_SOURCE_FACT),
        () => ({
          kind: "confidence-unsupported",
          detail: `"${part.question}" claims ${part.confidence} confidence from the birth chart alone; confirm it with a divisional chart, a Jaimini fact or a KP fact, or say low`,
        }),
      ),
      when(part.confidence === "high" && !citesTheRecord(part), () => ({
        kind: "confidence-unsupported",
        detail: `"${part.question}" claims high confidence with no recorded past event behind it; cite one, or say moderate`,
      })),
      when(choosesAPeriod(part) && candidatesOf(part).length < MIN_CANDIDATES, () => ({
        kind: "candidates-missing",
        detail: `"${part.question}" picks a period without comparing it with another; list at least ${MIN_CANDIDATES} candidates with the same evidence for each`,
      })),
      ...Arr.map(candidatesOf(part), (candidate) =>
        when(candidate.for.length === 0, () => ({
          kind: "no-evidence",
          detail: `"${part.question}" lists candidate ${candidate.periods.join(", ")} with nothing for it; give each candidate its evidence or drop it`,
        })),
      ),
      ...Arr.map(candidatesOf(part), (candidate) =>
        pipe(
          strayFact(candidate),
          Option.map((id): Problem => ({
            kind: "schools-mixed",
            detail: `"${part.question}" weighs ${id} on candidate ${candidate.periods.join(", ")}, which is dated by the other school's calendar; cite KP facts on kp: periods and Parashari facts on par: periods, or list a period from each`,
          })),
        ),
      ),
      pipe(
        candidatesOf(part).length >= MIN_CANDIDATES
          ? rankingFault(candidatesOf(part))
          : Option.none<string>(),
        Option.map((fault): Problem => ({
          kind: "ranking-broken",
          detail: `"${part.question}": ${fault}`,
        })),
      ),
      when(
        choosesAPeriod(part) &&
          Arr.some(facts.knownFactIds, (id) => RECORD_FACT.test(id)) &&
          !citesTheRecord(part),
        () => ({
          kind: "record-not-used",
          detail: `"${part.question}" times an event without using the person's recorded past events; compare the periods they fell in with the one you chose, and cite them for or against`,
        }),
      ),
      when(part.confidence === "high" && part.against.length === 0, () => ({
        kind: "one-sided",
        detail: `"${part.question}" claims high confidence without naming what speaks against it`,
      })),
    ]),
    ...Arr.map(cited, (id) =>
      when(!Arr.contains(facts.knownFactIds, id), () => ({
        kind: "unknown-fact",
        detail: `"${id}" is not a fact of this chart; cite ids exactly as the evidence gives them`,
      })),
    ),
    ...Arr.map(chosen, (id) =>
      when(!Arr.some(facts.periods, (period) => period.id === id), () => ({
        kind: "unknown-period",
        detail: `"${id}" is not a period of this person; use period ids exactly as the evidence gives them, with their kp: or par: calendar`,
      })),
    ),
  ]);

  const mentions = dateMentions(draft);
  const dateProblems = Arr.getSomes(
    Arr.map(mentions, (mention) =>
      when(
        !Arr.some(facts.periods, (period) => overlaps(mention, period)) &&
          !Arr.some(facts.citableMoments, (moment) => contains(mention, moment)),
        () => ({
          kind: "date-not-in-period",
          detail: `"${mention.text}" is in no period the worksheet chose and is not a recorded date`,
        }),
      ),
    ),
  );

  const wordingProblems = Arr.getSomes([
    when(!draft.includes(DISCLAIMER), () => ({
      kind: "missing-disclaimer",
      detail: `The answer must end with: ${DISCLAIMER}`,
    })),
    pipe(
      Option.fromNullishOr(draft.match(CERTAINTY_WORDING)),
      Option.map((match): Problem => ({
        kind: "certainty-wording",
        detail: `"${match[0]}" states certainty no reading has`,
      })),
    ),
    pipe(
      Option.fromNullishOr(draft.match(PROCESS_WORDING)),
      Option.map((match): Problem => ({
        kind: "process-wording",
        detail: `"${match[0]}" talks about how the answer was produced; speak as the astrologer`,
      })),
    ),
    pipe(
      Option.fromNullishOr(draft.match(SURE_WORDING)),
      Option.filter(
        () =>
          worksheet.parts.length > 0 &&
          Arr.every(worksheet.parts, (part) => part.confidence === "low"),
      ),
      Option.map((match): Problem => ({
        kind: "confidence-mismatch",
        detail: `"${match[0]}" claims more confidence than the worksheet, where every part is low; say how unsure you are in the same terms`,
      })),
    ),
    pipe(
      Option.fromNullishOr(draft.match(VAGUE_TIMING)),
      Option.map((match): Problem => ({
        kind: "vague-timing",
        detail: `"${match[0]}" places something in time without a date; give the month and year from a period you chose, or take the claim out`,
      })),
    ),
    when(LONG_DASH.test(draft), () => ({
      kind: "dash",
      detail: "The answer contains an em dash or en dash",
    })),
  ]);

  const problems = [...worksheetProblems, ...dateProblems, ...wordingProblems];
  return {
    ok: problems.length === 0,
    factsChecked: cited.length,
    periodsChecked: chosen.length,
    datesChecked: mentions.length,
    problems,
  };
}
