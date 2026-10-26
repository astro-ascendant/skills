# Parashari readings

Parashari only. Person files live under `persons/<name>/`. Section names in
this file refer to `{guidebook-root}/parashari/advanced-chart-analysis.md`
unless another guidebook file is named.

## Steps

### Step 1: Survey the Parashari chart

Read `persons/<name>/charts/D1.md`, the vargas the question needs,
`persons/<name>/dasha.md`, and `persons/<name>/sav.md`. Confirm Provenance: the
`calculation` header says `School: Parashari`, ayanamsha `Lahiri`, house system
`WholeSign`. On any mismatch, stop and report the mismatch; do not read
placements across schools.

Notes stay in working context and are never emitted.

Tier the inventory by question width. A broad question (`How is next year`,
`tell me about my life`) or one spanning several matters gets the full survey
below. A narrow question gets `persons/<name>/charts/D1.md` and the dasha file
now, then only the mapped group's houses and lords after Step 2. Never skip
the dasha backbone.

Always note the running mahadasha and antardasha plus the next two periods from
`persons/<name>/dasha.md`, mapped to houses (*The dasha chain*): the time
backbone of every answer.

Full survey, for broad questions:

- All 12 houses: occupants, owner, owner's placement, aspects, yoga links, and
  varga echo. Judge each house at three layers (*Three-layer house judgment*)
  and mark it strong, average, or weak. Read the network, not the wheel
  (*Never read a placement in isolation*).
- All 9 planets: functional role for this Lagna, ownership, occupancy,
  dispositor, nakshatra lord, aspects, and varga repeats. Weight functional
  role before natural beneficence (*Functional before natural beneficence*),
  and read aspects as two-way cargo (*Directional aspect analysis*).
- Vargas as confirmation, never as separate horoscopes: D9 for marriage and
  strength (*D9 as strength and dharma filter*), D10 for career (*D10 through
  career themes*), and repeated planets across every event varga (*Varga
  lordship echo*).
- The `persons/<name>/sav.md` totals as a relative-strength filter
  (*Sarvashtakavarga for relative strength*).

`persons/<name>/charts/D1.md` is the only source for rasi and bhava placement.
Never read `persons/<name>/kp/D1.md` for house placement or varga analysis.

Done when the dasha backbone is named and either every house has a one-line
state with every planet carrying a functional role plus key houses (broad), or
the mapped group's houses and lords do (narrow).

### Step 2: Map the question onto the survey

Frame the event precisely before touching a house (*Start with the question,
not the chart*). Convert it to a house group with four roles: primary,
supporting, result, and obstruction (*Use house groups before individual
houses*).

Parashari has no event table like `{guidebook-root}/kp/house-grouping.md`; the
equivalent is *Use house groups before individual houses* for the roles and
*Same technique for every domain* for the event sets (career 2-6-10-11,
marriage 2-7-11, children 2-5-11, education 2-4-5-9, property 4-2-11, foreign
4-9-12, withdrawal 5-9-12). When the domain is not listed, derive the set from
house significations and state the roles you chose.

- Narrow question: proceed with the mapped house group, extending the survey
  to its houses and lords.
- Broad question: cover the mapped group plus every house the survey marks
  active, meaning houses tied to the running and next dasha lords and houses
  marked weak or afflicted. Never answer a broad question from a single house
  group.

Done when the house group and its four roles are named, plus the extra active
houses for a broad question.

### Step 3: Verify the birth moment

Parashari has no RP test. Rectify through event architecture instead
(*Rectification through event architecture*, *Do not rectify with one event*).

1. Ask for a set of dated events: education, first job, career change,
   marriage, relocation, major finance. With fewer than three usable dates,
   skip rectification, state `birth time unverified`, and lower confidence.
2. For each candidate moment, run
   `bash "<skill-dir>/scripts/add-person.sh" --name "<name> rectification" ...`
   with the trial moment, then check that the event house group, the dasha at
   that date, and the transit all fit (*Dasha event threshold*).
3. Keep the moment that fits the most events coherently, report `birth time
   verified` or `suspect with provisional moment X`, then delete
   `persons/<name> rectification/`.

Never refresh `persons/<name>/` at a trial moment: its birth header stays
immutable.

### Step 4: Judge the promise

Promise comes from lordship and yoga delivery, then varga confirmation, never
from a single placement.

- Chain the evidence: event, houses, owners, occupants, dispositor, nakshatra
  lord, varga, dasha (*Never read a placement in isolation*).
- Yogas deliver only as far as their planets can: check strength, combustion,
  debility, house relevance, and varga visibility (*Yoga delivery capacity*),
  and run cancellation before announcing a yoga (*Check yoga cancellation
  first*).
- Confirm that the promise survives specialisation in the varga the school
  file names (*Varga lordship echo*).
- Split occurrence from quality: promised is not the same as easy or stable
  (*Separate event from quality*).
- Close the promise in one line using the terms in *Final synthesis formula*.

Done when the promise, its house links, its yogas or cancellations, and its
varga confirmation are stated.

### Step 5: Select significators

Rank event significators instead of listing planets (*Event-specific
significator ranking*): tier 1 owners and occupants of primary houses, tier 2
supporting-house links, tier 3 domain links. Weight multi-house planets by how
many group houses they carry (*The multi-house planet*). Build the matrix
(*House signification matrix*) and remove double counts (*Do not double-count
one planet*).

Cite `persons/<name>/charts/D1.md` by house and planet field, plus the varga
file used. Done when the ranked shortlist is named with its citations.

### Step 6: Time the event (dasha and transit)

Start from the event, not from the running planet (*Dasha analysis starts from
the event*). Map mahadasha, antardasha, and pratyantardasha to the group houses
(*The dasha chain*) and require all three to touch the event set (*Dasha event
threshold*). Read `persons/<name>/dasha.md` for period dates. Refine with
transit:

```bash
bash "<skill-dir>/scripts/check-transit.sh" --name "<person>" \
  --moment "<ISO-8601>" --planet <graha> --school parashari
```

Saturn sets duration (*Saturn defines duration*), Jupiter expands what is
already active (*Jupiter expands what is activated*), and transit alone is an
opportunity, never proof (*Transits as triggers*). Qualify the transit with
`persons/<name>/sav.md` scores (*Ashtakavarga as transit filter*).

Done when the dasha lords, the transit check, and the SAV filter are cited, or
the absence of a conjoined period is stated.

### Step 7: Cite

Follow `## Evidence` and `## Output` in `SKILL.md`. Every claim carries the
guidebook section name plus the person file field.
