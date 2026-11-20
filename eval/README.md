# Evaluation harness

Measures whether the KP judge's forecasts are better than chance. It lives
outside `skills/ascendant/`, so it never ships to users.

```bash
bun run eval --data eval/data/<name>.jsonl        # print and save a report
bun test tests/eval                               # test the harness itself
```

Reports go to `eval/reports/<name>.<engine-version>.json` and `.md`. Keep one
per engine version to see whether a rule change helped. The folder is
gitignored, as is `eval/data/`: real birth data is personal and must not be
committed.

## Dataset format

JSONL, one person per line:

```text
{"id":"p001","birth":"1990-01-01T12:00:00+05:30","latitude":12.9716,"longitude":77.5946,"sex":"Female","events":[{"event":"marriage","date":"2019-02-20"}]}
```

| Field                   | Meaning                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                    | Any label; use one that does not identify the person                                              |
| `birth`                 | ISO 8601 with `Z` or an offset. Only use recorded birth times; the rules are sensitive to minutes |
| `latitude`, `longitude` | Birth place                                                                                       |
| `sex`                   | Optional, `Male` or `Female`                                                                      |
| `events[].event`        | An id from `bun skills/ascendant/tools/ascendant.ts events`                                       |
| `events[].date`         | `YYYY-MM-DD`                                                                                      |

Events before birth or at age 80 and over are dropped and listed on stderr.

## What is scored

Each event that happened is one case. Every model answers the same question:
given that the event happened, in which year of age? A model gives a
probability to each of the 80 years, and is scored on the year that happened.

| Model                           | Forecast                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `uniform`                       | Every year equally likely                                                                                                             |
| `base-rate`                     | The ages at which the same event happened to the other people                                                                         |
| `engine`                        | Probability in proportion to the days of the year on which a conjoined period runs and its three lords transit stars of significators |
| `engine-shuffled-chart`         | The engine on the next person's chart                                                                                                 |
| `engine-shifted-birth-time`     | The engine with the birth time moved by `--shift-hours` (default 6)                                                                   |
| `engine-with-base-rate`         | Engine and base rate multiplied                                                                                                       |
| `shuffled-chart-with-base-rate` | The same with the next person's chart                                                                                                 |

## Choice test for the promise rule

The timing report only looks at events that happened. The choice test asks
whether the yes-or-no rule tells options apart when the wrong options are
known: a person who became a politician did not become a surgeon.

```bash
bun run eval:choices --data eval/data/<people>.jsonl --choices eval/data/<name>.choices.json
```

The choice file is JSON: a `question`, the `options` (event ids), and one
answer per person with `id` (from the dataset), `chosen` (the options that
are true) and optionally `unsure` (options left out for that person).

Each verdict becomes a support value: promised 1, mixed leaning yes 0.75,
mixed balanced or no rule 0.5, mixed leaning no 0.25, denied 0.

| Number                                  | Meaning                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Top choice, own chart                   | How often the true option has the highest support; a tie shares the credit  |
| Top choice, other charts                | The same with every other person's chart: what chance looks like here       |
| Gain and range                          | Own minus other, with a 95% interval from resampling people                 |
| Share of reassignments at least as good | How often dealing the charts out at random does as well; small means signal |
| Margin                                  | Mean support for true options minus mean support for false ones             |

Both are reported twice: with the houses as judged, and with the guidebook's
parenthesised houses counted as conducive.

## How to read a report

Read the comparisons first.

- **Engine vs shuffled chart** is the test that matters. If a person's own
  chart does no better than someone else's, the chart carries no information
  the rules can use, whatever the other numbers say.
- **Engine vs shifted birth time** checks the claim that minutes matter.
- **Engine with base rate vs base rate** asks whether the chart adds anything
  to knowing the usual age for an event.

A comparison is called `better` or `worse` only when the whole 95% interval is
on one side of zero. The interval comes from resampling people, with a fixed
seed, so the same data always gives the same report.

The engine can score below `uniform`: it puts almost all probability on the
years its periods cover, so every event outside them costs a lot.

## How the harness itself is tested

`tests/eval/harness.test.ts` builds made-up people with `eval/synthetic.ts`.
Their events follow typical ages and ignore their charts, so the correct
result is "no evidence that the chart carries information". A second test
plants events on each person's own qualifying days and checks that the harness
then reports a signal. Both test the harness, not the engine.

## What a real run needs

A dataset of real people with recorded birth times and dated life events, in
`eval/data/`. Check the licence of any public collection before copying it
here, and never commit it.
