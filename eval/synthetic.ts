import { Array as Arr, DateTime, Effect, Random, Schema } from "effect";

import { EvalPerson, YEAR_MS } from "./dataset.ts";

const PLACES = [
  [12.9716, 77.5946],
  [28.6139, 77.209],
  [19.076, 72.8777],
  [13.0827, 80.2707],
  [22.5726, 88.3639],
] as const;

const LIFE_EVENTS = [
  { event: "higher-education", typicalAge: 18, spreadYears: 1.5, shareOfPeople: 0.7 },
  { event: "service-or-business", typicalAge: 23, spreadYears: 3, shareOfPeople: 0.9 },
  { event: "marriage", typicalAge: 28, spreadYears: 4, shareOfPeople: 0.8 },
  { event: "child-birth", typicalAge: 30, spreadYears: 4, shareOfPeople: 0.6 },
  {
    event: "purchase-of-property-vehicle-furniture",
    typicalAge: 36,
    spreadYears: 7,
    shareOfPeople: 0.5,
  },
  { event: "foreign-travel", typicalAge: 32, spreadYears: 9, shareOfPeople: 0.4 },
] as const;

const BIRTH_FROM = Date.UTC(1950, 0, 1);
const BIRTH_TO = Date.UTC(1990, 0, 1);

export const dateOf = (epochMillis: number): string =>
  DateTime.formatIsoDateUtc(DateTime.makeUnsafe(epochMillis));

const normal = Effect.map(
  Effect.all([Random.next, Random.next]),
  ([first, second]) => Math.sqrt(-2 * Math.log(1 - first)) * Math.cos(2 * Math.PI * second),
);

const decodePerson = Schema.decodeUnknownEffect(EvalPerson);

const nullPerson = Effect.fn("Eval.nullPerson")(function* (index: number) {
  const birth = Math.floor(BIRTH_FROM + (yield* Random.next) * (BIRTH_TO - BIRTH_FROM));
  const place = PLACES[Math.floor((yield* Random.next) * PLACES.length)] ?? PLACES[0];
  const events = yield* Effect.forEach(
    LIFE_EVENTS,
    ({ event, typicalAge, spreadYears, shareOfPeople }) =>
      Effect.gen(function* () {
        const happens = (yield* Random.next) < shareOfPeople;
        const ageYears = Math.max(1, typicalAge + spreadYears * (yield* normal));
        return happens ? [{ event, date: dateOf(birth + ageYears * YEAR_MS) }] : [];
      }),
  );
  return yield* Effect.orDie(
    decodePerson({
      id: `synthetic-${String(index + 1).padStart(4, "0")}`,
      birth: DateTime.formatIso(DateTime.makeUnsafe(birth)),
      latitude: place[0],
      longitude: place[1],
      events: Arr.flatten(events),
    }),
  );
});

export const nullPersons = (count: number) =>
  Effect.forEach(
    Arr.makeBy(count, (index) => index),
    nullPerson,
  );

export const toJsonl = (persons: ReadonlyArray<EvalPerson>): string =>
  `${Arr.join(
    Arr.map(persons, (person) => JSON.stringify(person)),
    "\n",
  )}\n`;
