import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { addPerson, checkTransit, home } from "../../skills/ascendant/tools/api.ts";
import { inTempWorkspace } from "../support.ts";

const eventsOf = (output: Record<string, unknown>) =>
  output["events"] as ReadonlyArray<Record<string, unknown>>;

describe("script api", () => {
  it.effect("composes tools with plain input and reports validation errors", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        const added = yield* addPerson({
          name: "Ada",
          moment: "1990-01-01T12:00:00+05:30",
          latitude: 12.9716,
          longitude: 77.5946,
        });
        const people = yield* home();
        const transits = yield* Effect.forEach(
          ["Jupiter", "Saturn"] as const,
          (planet) =>
            checkTransit({
              name: "Ada",
              moment: "2026-08-27T22:00:00+05:30",
              planet,
              count: 1,
            }),
          { concurrency: 2 },
        );
        const summary = yield* checkTransit({
          name: "Ada",
          moment: "2026-08-27T22:00:00+05:30",
          planet: "Jupiter",
          count: 1,
          summary: true,
        });
        const crossing = yield* checkTransit({
          name: "Ada",
          moment: "2026-08-27T22:00:00+05:30",
          planet: "Moon",
          school: "kp",
          kinds: ["cusp-crossing"],
          house: 1,
          count: 1,
          summary: true,
        });

        expect(people).toMatchObject({ persons: { count: 1 } });
        expect(transits).toHaveLength(2);
        expect(added["kpAscendant"]).toMatchObject({
          signLord: expect.any(String),
          starLord: expect.any(String),
          subLord: expect.any(String),
        });
        const [full] = eventsOf(transits[0] ?? {});
        const [brief] = eventsOf(summary);
        expect(full).toHaveProperty("chart");
        expect(brief).not.toHaveProperty("chart");

        const [crossed] = eventsOf(crossing);
        const natalCusp = (added["kpAscendant"] as { longitude: number }).longitude;
        expect(crossed).toMatchObject({ kind: "cusp-crossing", house: 1 });
        expect(crossed?.["longitude"]).toBeCloseTo(natalCusp, 1);

        const failure = yield* Effect.flip(
          checkTransit({ name: "Ada", moment: "nope", planet: "Jupiter" }),
        );
        expect(failure).toMatchObject({ _tag: "CommandError", code: "VALIDATION_ERROR" });
      }),
    ),
  );
});
