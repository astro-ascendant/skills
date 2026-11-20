# Reasoned reading

Use this file for a question about a specific matter: whether something
happens, when it happens or happened, or what kind it is (which subject, which
line of work).

You are the astrologer and the judgment is yours. The tools give you facts
about the chart and check that what you cite is true; they never decide. The
guidebook gives you the method. Reason the way an experienced astrologer
does: gather what speaks for and against, weigh it, narrow the timing step by
step, test it against ordinary life, and commit to an answer.

Everything in this file is how you work, not what you say. The answer is in
your own voice and names none of it (see `## Output` in `SKILL.md`).

Use the host tools `ascendant_evidence`, `ascendant_check_transit` and
`ascendant_verify` when they exist. Otherwise use the scripts shown below.

## Steps

### Step 1: Understand the question

Split the question into parts. For each part write down, in working notes:

- **The matter** and the houses it turns on. Take the houses from
  `{guidebook-root}/kp/house-grouping.md` (KP: primary, supporting,
  detrimental) and from the house meanings in
  `{guidebook-root}/parashari/advanced-chart-analysis.md` (`Use house groups
  before individual houses`). `bash "<skill-dir>/scripts/ascendant.sh" events`
  lists the KP house groups as event ids; use one when it fits, and plain
  house numbers when none does.
- **The kind of answer**: whether, when, or which kind.
- **Past or future**. `When did` is a search over the life so far. `When
  will` is a search from today.
- **The stretch of life to search**: the earliest and latest age at which
  this matter is possible at all for this person. Keep it wide. Ordinary
  life is weighed later, per candidate, in Step 4.

Every part stands on its own. Read each one from the chart, even when it
follows from another part (a second child follows a first). Never place
one event by counting forward or back from your own estimate of another: if
the first estimate is wrong, the second inherits the error. Only a recorded
event (`memory.*`) may anchor another part.

The rows `events` lists as `refused` are blocked on safety grounds. Follow
`## Safety` in `SKILL.md`.

### Step 2: Gather the chart evidence

```bash
bash "<skill-dir>/scripts/evidence.sh" --name "<person>" \
  [--event <event-id>] [--houses <h1,h2,...>] [--vargas <9,10,...>] \
  [--at "<ISO-8601>"]
```

Call it again for every new question in the conversation: the houses change
with the matter, and facts carried over from an earlier question are the
wrong ones. For anything about the present (`what does he like now`, `how are
things at the moment`) pass `--at` with today's date: `running` then lists
the periods running now at every level and where Jupiter, Saturn and Rahu
are. A claim about now or about what comes next needs those period ids in
the worksheet like any other date.

It returns `facts`, each with an `id` and one line of text, for both schools:

| Id | What it holds |
|---|---|
| `kp.cusp.<house>` | The cusp with its sign, star, pada and its sign, star, sub and sub-sub lords |
| `kp.significators.<house>` | Planets that signify the house, strongest level first |
| `kp.planet.<planet>` | KP placement, star and pada, star, sub and sub-sub lords, houses signified at each level |
| `kp.rule.<event-id>` | What the strict KP promise rule alone says. One line of evidence, never the answer |
| `par.house.<house>` | Sign, lord and where the lord sits, occupants, planets aspecting |
| `par.planet.<planet>` | House, sign, degree, star and pada, dignity, retrograde, houses owned, company, aspects given and received, distance from the Sun |
| `d<n>.lagna`, `d<n>.planet.<planet>` | The divisional chart placement and dignity |
| `jaimini.karaka.<role>`, `jaimini.karakamsha.<planet>` | The seven Jaimini significators by degree, and the D9 sign of the soul significator |
| `memory.<line>` | A past event the person has recorded, tagged or not |

Choose `--vargas` by the matter (`Vargas are not separate horoscopes`): D9 for
strength and partnership, D10 for work, D7 for children, D4 for property, D24
for learning. Read `basis` once: the two schools use different zodiac offsets
and house systems, so the same planet can sit in different houses in each.

The person files under `persons/<name>/` stay open to you for anything the
evidence does not list (`sav.md`, the rest of `jaimini/`, other vargas). When
your reasoning rests on one, cite it in the worksheet as `file:<path inside
the person record>`, for example `file:sav.md`. Do not take periods or dates
from the dasha files: the record holds two calendars some weeks apart, and
only the one `evidence` returns can be cited.

When the guidebook has no method for a part (a favourite deity, a taste, a
habit), say so in the worksheet's reasoning, use the nearest classical
technique you know, cite the facts it rests on, and keep the confidence
low.

### Step 3: Judge whether, and which kind

Parashari leads here. Whether something happens, which kind it is, what a
person is like and what a stretch of life feels like are questions of
promise and quality, and the Parashari reading (house, lord, dignity,
aspects, natural significator, divisional chart) carries them. Reach your
conclusion from it first. Then read KP as a second opinion: agreement raises
your confidence, disagreement lowers it, and KP does not overturn a clear
Parashari reading. Timing is different: Step 4 uses both schools on the
periods.

- **Parashari, first**: follow the promise chain in
  `advanced-chart-analysis.md` (`Three-layer house judgment`, `Build a
  lordship network`, `Functional before natural beneficence`): the house,
  its lord's placement and dignity, occupants and aspects, the natural
  significator of the matter, and the divisional chart that confirms or
  weakens it. Ask for the divisional chart of the matter in Step 2; a
  Parashari conclusion without it is half read.
- **KP, as the cross-check**: follow
  `{guidebook-root}/kp/fundamental-principles.md` (`Finding out promises in a
  chart`). Read the sub lord of the main cusp and what it signifies through
  its star lord, then its sub-sub lord, then the significators of the
  supporting and detrimental houses. `kp.rule.*` is that rule applied
  mechanically, one line of evidence among the rest.
- **Which kind** (subject, line of work): compare the candidates against each
  other on the same evidence (`Specialization from house combos`, `Career
  through 2-6-10-11`). Rank them; do not judge each alone.

Write the evidence for and the evidence against as two lists of fact ids. Do
not count one planet twice (`Do not double-count one planet`). Run the
`Contradiction audit`: when two findings disagree (a degree in engineering is
shown but schooling looks blocked), resolve it or say which one you trust and
why. Never drop the awkward one silently.

When the two disagree on a question of this kind, give the Parashari
conclusion, lower your confidence, and say that the second reading differs.

### Step 4: Time it from the ranking

Skip this step when the answer to Step 3 is no.

1. **Rank the periods** of the whole stretch in which the matter is possible
   at all:

   ```bash
   bash "<skill-dir>/scripts/evidence.sh" --name "<person>" --event <event-id> \
     --from "<ISO-8601>" --to "<ISO-8601>" --depth bhukti
   ```

   Use `--houses` instead of `--event` when no event id fits. `ranking.rows`
   lists every period of the stretch, strongest first, scored the same way
   each time: how strongly its lords connect to the matter in KP and in
   Parashari (each on its own calendar), the slow transits during it, and
   the lords it shares with the person's recorded events. `ranking.basis`
   says exactly what is counted. Each row has a `rating` (`weak`, `fair`,
   `strong`) and the Parashari periods that cover the same dates.

   Use `--depth bhukti` for a stretch of more than four years and
   `--depth antara` for a shorter one. To name a month inside a chosen
   period, rank again inside its dates one level deeper.
2. **Take the three strongest windows as your candidates.** You may add
   others; you may not leave any of the three out.
3. **Look at each candidate closely**:

   ```bash
   bash "<skill-dir>/scripts/evidence.sh" --name "<person>" --event <event-id> \
     --compare "<period-id>,<period-id>,<period-id>"
   ```

   `candidates` gives the same things for each: its dates and age; what
   every lord means in that period's own school; under
   `sameDatesInOtherCalendar` which periods of the other school cover those
   dates; the slow transits during it, with the house in both house systems
   (`Transits as triggers`); and under `record` which lords it shares with
   the periods the person's recorded events fell in.
4. **Rate every candidate on two separate scales.**

   | Scale | Values | Where it comes from |
   |---|---|---|
   | `chart` | `weak`, `fair`, `strong` | The ranking's `rating`. Keep it unless you have a reason the ranking cannot see |
   | `practicality` | `impossible`, `unusual`, `ordinary` | Ordinary life alone, for this person, place and time |

   The ranking counts connections. It does not read quality: a divisional
   chart, a yoga, a combust or retrograde lord, a clear verdict from Step 3.
   When one of those changes the picture, move the `chart` rating one step
   and give the reason in `adjusted`. Never move it two steps, and never
   move it to make a preferred window win.

   `practicality` has no value for typical or common. A window that would
   surprise nobody is `ordinary`, however often or seldom it happens. Marriage
   at fourteen is `impossible`; a first child at forty-six is `unusual`;
   moving house in one year rather than the next is `ordinary`.
5. **Choose by rule.** An `impossible` candidate is out. An `unusual` one
   stays only if its `chart` rating is higher than every `ordinary`
   candidate's. Among those left, the higher `chart` rating wins, and
   `practicality` plays no further part. When two are level on `chart`, take
   the one the ranking places higher, name the other, and say what would
   separate them. The check in Step 6 applies this rule to your worksheet.

When the question has linked parts (an offer and a joining, an engagement and
a wedding), rank and choose for each part from the full set; do not hand one
window to each part in advance.

For a past event, give your best estimate and ask the user whether it is
right, so the true date can be recorded and the birth time checked against
it. Do not refuse to estimate because the user already knows the answer.

### Step 5: Decide how sure you are

| Confidence | When |
|---|---|
| `high` | Both schools agree, the evidence against is minor and named, and a recorded past event confirms the same logic |
| `moderate` | Both schools agree, or one is clear and the other is silent, with nothing recorded to test against |
| `low` | The schools disagree, the evidence for and against is close, or the timing rests on one level only |

The check in Step 6 enforces this. A part with no period (whether, which
kind, what he is like) must cite Parashari facts, and `moderate` or `high`
there needs a second source beside the birth chart: a divisional chart, a
Jaimini fact or a KP fact. A timed part needs facts from both schools for
`moderate` or `high`. `high` always needs a `memory.*` fact too. A part with no guidebook method stays `low`.

Say what would change your answer: usually a confirmed birth time or the date
of a past event of the same kind. A birth time that is off by a few minutes
moves the sub lords and the short periods first, so month-level timing is
the least certain part.

### Step 6: Write, then check

Write the answer under `## Output` in `SKILL.md`. Then write the worksheet
behind it and check both before the user sees anything. Say nothing to the
user about the check.

Save the draft to `./.ascendant/draft.md` and the worksheet to
`./.ascendant/worksheet.json`:

```json
{
  "asOf": "<today, YYYY-MM-DD>",
  "parts": [
    {
      "question": "<the part of the question, in the user's words>",
      "answer": "<your answer to it in one line, with the month and year if it is timed>",
      "reasoning": "<what the evidence for showed, what the record of past events taught you, and what the main doubt is>",
      "for": ["<fact id>", "<fact id>"],
      "against": ["<fact id>"],
      "periods": ["<period id of the chosen candidate>"],
      "searched": { "from": "<YYYY-MM-DD>", "to": "<YYYY-MM-DD>" },
      "topic": { "event": "<event id>" },
      "depth": "<bhukti or antara>",
      "candidates": [
        {
          "periods": ["<period id>"],
          "chart": "<weak, fair or strong>",
          "practicality": "<impossible, unusual or ordinary>",
          "for": ["<fact id>"],
          "against": ["<fact id>"],
          "chosen": true
        },
        {
          "periods": ["<period id>"],
          "chart": "<weak, fair or strong>",
          "practicality": "<impossible, unusual or ordinary>",
          "for": ["<fact id>"],
          "against": ["<fact id>"],
          "adjusted": "<only when chart differs from the ranking: what the ranking cannot see>"
        }
      ],
      "confidence": "<low, moderate or high>"
    }
  ]
}
```

The shape is the whole example: every value comes from this person's
evidence, never from this file.

One part for each part of the question. `reasoning` says in a sentence or
two how you weighed the evidence and what decided it. `for` and `against`
hold fact ids exactly as the evidence gave them; list every fact that
materially speaks against, not one for form. `periods` holds the ids of the
periods your dates come from, or the running periods if you speak about
now. A part that picks a period carries `searched`, `topic` and `depth`
exactly as you gave them to the ranking call (`topic` is
`{ "event": "<id>" }` or `{ "houses": [..] }`), and `candidates` from
Step 4, which include the three strongest windows, with exactly one marked
`chosen`; leave `candidates` out of a part
that has no timing or only speaks about now. `asOf` is today's date.

```bash
bash "<skill-dir>/scripts/verify.sh" --name "<person>" \
  --draft-file ./.ascendant/draft.md --worksheet-file ./.ascendant/worksheet.json
```

It checks that every cited fact and period exists for this person, that
each candidate's facts belong to the school whose calendar dates it, that
every date in the draft falls inside a listed period or is a recorded date,
that the candidates include the three strongest windows of the ranking,
that each `chart` rating is the ranking's or one step from it with a
reason, that the choice follows the rule in Step 4, that the answer does
not sound surer than the worksheet,
that high confidence names what speaks against it, and the wording rules.

- `ok: true`: send the draft unchanged.
- `ok: false`: fix each listed problem and check again. Never send an
  answer that has not passed.
  - A fact id that does not exist means you misread or invented a
    placement: go back to the evidence, do not rename the id.
  - A date outside every chosen period has two honest fixes: add the period
    it comes from to the worksheet because the chart supports it, or take
    the claim out. Never reword a date into a vague phrase (`a few months
    earlier`, `around then`) to get past the check; vague timing is refused
    too.
  - Confidence the evidence cannot carry: gather the missing evidence, or
    lower the confidence.

### Step 7: Evidence on request

When the user asks why, or asks for the evidence, give the reasoning from the
worksheet in plain steps: what speaks for, what speaks against, how you
weighed them, and how you narrowed the timing. Cite each rule as
`{guidebook-root}/<file>:<Named Heading>` and each chart fact as
`persons/<name>/<file>:<field>` (KP facts in `kp/D1.md`, Parashari facts in
`charts/D1.md`, divisional facts in `charts/D<n>.md`, periods in
`kp/dasha.md`, `kp/pratyantardasha.md` and `kp/sookshma.md`).
