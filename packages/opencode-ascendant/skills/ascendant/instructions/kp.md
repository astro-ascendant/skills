# KP readings

KP only. Person files live under `persons/<name>/kp/`. Section names in this
file refer to `{guidebook-root}/kp/fundamental-principles.md` unless another
guidebook file is named.

## Steps

### Step 1: Survey the KP chart

Read `persons/<name>/kp/D1.md` and `persons/<name>/kp/dasha.md`. Confirm
Provenance: the `calculation` header says `School: KP`, ayanamsha
`KrishnamurtiVP291`, house system `Placidus`. On any mismatch, stop and report
the mismatch; do not read placements across schools.

Notes stay in working context and are never emitted.

Tier the inventory by question width. A broad question (`How is next year`,
`tell me about my life`) or one spanning several matters gets the full survey
below. A narrow question gets the house table (`Cusp Lords`), the planet table
(`Planet Lords`), and the dasha file now, then only the mapped group's houses
and lords after Step 2. Never skip the dasha backbone.

Always note the running mahadasha and antardasha plus the next two periods from
`persons/<name>/kp/dasha.md`: the time backbone of every answer.

Full survey, for broad questions:

- All 12 houses: sign, cusp, occupants, owner, and the four lords (Sign, Star,
  Sub, Sub-Sub) from `Cusp Lords` in `persons/<name>/kp/D1.md`. Mark each house
  strong (occupied, exalted or own-sign owner, many significators), average, or
  weak (debilitated or enemy owner, retrograde occupant, empty with a weak
  owner). Take significations from `Planet Significations`.
- All 9 planets: dignity, retrograde state, star and sub lord from
  `Planet Lords`, Rahu or Ketu agent, and the houses each signifies per
  *Finding Signification of Planets*.
- Natal ruling planets per *Ruling Planets (RP)*.

`Cusp Lords` and `Planet Lords` are the only source of truth for KP lords. Join
a planet to its star and sub by the `Planet Lords` name; use the lord math in
`<skill-dir>/tools/kp-lords.ts`. Never recompute a table by hand.

Done when the dasha backbone is named and either every house has a one-line
state with every planet carrying dignity plus signified houses (broad), or the
mapped group's houses and lords do (narrow).

### Step 2: Map the question onto the survey

Translate the question into guidebook terms: matter, houses, owners, cusps,
significators. Open `{guidebook-root}/kp/house-grouping.md`, find the event row,
and record the primary house, the supporting houses, and the detrimental
houses (the 12th from each house of the group). When no row names the event,
take the closest rows as a stand-in, name them, say so, and lower confidence;
never invent houses. Then fit that group to the Step 1 survey.

- Narrow question (one matter): proceed with the mapped house group, extending
  the survey to its houses and lords.
- Broad question (`How is next year`, `tell me about my life`): cover the
  mapped group plus every house the survey marks active, meaning houses tied to
  the running and next dasha lords and houses marked weak or afflicted. Never
  answer a broad question from a single house group.

Done when the house group is named in guidebook terms, plus the extra active
houses for a broad question.

### Step 3: Verify the birth moment (RP test)

Cusps and sub-lords move fast, so verify the moment before judging. Read
`{guidebook-root}/kp/birth-time-rectification.md`, then run the RP test:

1. Get the ruling planets at the judgment moment: the moment you take up the
   rectification, which is now, written with the birth place's UTC offset
   (read it from `persons/<name>/input.md`):
   `bash "<skill-dir>/scripts/ruling-planets.sh" --moment "<ISO-8601>" --name "<person>"`.
   Use `--latitude` and `--longitude` instead when the judgment place is not
   the birth place. Step 5 reuses this output, so run it once.
2. Read the natal Ascendant sign lord, star lord, and sub lord from `Cusp Lords`
   house 1 in `persons/<name>/kp/D1.md`. A judgment RP is a hit when it equals
   any one of these three lords. Count Rahu or Ketu through its agent; drop an
   RP placed in the star or sub of a retrograde planet.
3. Strength order, strongest first: Ascendant star lord, Ascendant sign lord,
   Moon star lord, Moon sign lord, day lord (UTC weekday; near sunrise treat a
   lone day-lord miss as weak). Use it only to choose which RPs to keep when you
   need fewer than five; it is not a tie-break between trial moments.
4. Match: every distinct RP is one of the three Ascendant lords (the guidebook's
   "should be among"). State `birth time verified` and proceed. Otherwise there
   is no match; the hit count is the number of distinct RPs that are one of the
   three lords.

No match: the moment is suspect. On a writable host, test trial moments at
+/-5, +/-10, and +/-15 minutes. Trials go into rectification scratch records,
never into the saved record. A record holds one set of birth data, so give
each trial its own name, `<name> rectification <offset>` (for example
`<name> rectification +5`):

```bash
bash "<skill-dir>/scripts/add-person.sh" \
  --name "<name> rectification <offset>" \
  --moment "<trial ISO-8601>" \
  --latitude <latitude> --longitude <longitude>
```

Each add-person result carries `kpAscendant` (the trial's Ascendant sign,
star, and sub lords), so count the hits from it without opening files. Keep the
trial with strictly the most hits and report `suspect, provisional moment X`
with lower confidence. When two or more trials tie for the most hits, choose
none: report `suspect, recorded moment kept` with lower confidence. Then
delete every `persons/<name> rectification */` record. Never refresh
`persons/<name>/` at a trial moment: its birth header stays immutable. Methods
under *Birth Time Rectification* in
`{guidebook-root}/kp/recent-researches.md` are cross-checks only, never
decisive.

Done when the verdict (`verified`, or `suspect with provisional moment X`) is
stated with the RP output and `Cusp Lords` citations.

### Step 4: Judge the promise

Read `{guidebook-root}/kp/index.md` for scope, then apply *Finding out promises
in a chart*: the sub-lord of the primary cusp decides whether the matter is
promised.

- Sub-lord signifies one or more houses of the group: promised.
- Sub-lord signifies only detrimental houses: denied.
- Sub-lord signifies both: it fructifies only in the matching dasha periods.
- One supporting house does not outweigh stronger contrary significations.

Read the sub-lord's houses at Levels 1-4 from *Finding Signification of
Planets*, and cite `persons/<name>/kp/D1.md:Planet Significations`. For a broad
question repeat this per house group from Step 2, one verdict line each.

Done when the promise rule, its houses, and both citations are stated.

### Step 5: Select fruitful significators

Reuse the Step 3 ruling-planet output. Intersect the RPs with the House
Significators of the group houses; common planets are the strongest. Then apply
*Selection of Significators* (detrimental-house, sub-lord, and ruling-planet
methods) and the ordered list in *Selection of Fruitful significator: A Step by
Step Approach*.

Cite `persons/<name>/kp/D1.md:House Significators` and
`persons/<name>/kp/D1.md:Planet Significations` for each shortlisted planet.
Done when the shortlist is named with its citations.

### Step 6: Time the event (DBAS and transit)

The matter fructifies in the conjoined dasha, bhukti, and antara of house-group
significators. Apply *Timing Events*, read `persons/<name>/kp/dasha.md`, and
pick one dasha, one bhukti, and one antara lord from the Step 5 shortlist,
strongest first. Then refine with transit:

```bash
bash "<skill-dir>/scripts/check-transit.sh" --name "<person>" \
  --moment "<ISO-8601>" --planet <graha> --school kp --summary
```

`--summary` leaves out the chart attached to each event, keeping the dates and
signs; drop it only when you need the chart at the event moment.

To see a lord enter a house of the group, search its crossing of that house's
natal cusp: add `--kinds cusp-crossing --house <h>`, one house per run. Each
event reports `house` and `moment`. Slow planets may need `--max-years`. To
check several lords, houses, or dates in one run, follow
`instructions/scripting.md`.

Dasha, bhukti, and antara lords should transit significators of the group
houses. Sun transit gives within-a-year precision, Moon within-a-month. Done
when the DBAS lords and the transit check are cited, or the absence of a
conjoined period is stated.

### Step 7: Cite

Follow `## Evidence` and `## Output` in `SKILL.md`. Every claim carries the
guidebook section name plus the person file field.
