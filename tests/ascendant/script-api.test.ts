import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";

import { addPerson, checkTransit, home } from "../../skills/ascendant/tools/api.ts";

describe("script api", () => {
  test("composes tools with plain input and reports validation errors", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ascendant-script-api-"));
    const previous = process.cwd();
    process.chdir(workspace);

    try {
      const program = Effect.gen(function* () {
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
        return { added, people, transits, summary, crossing };
      });

      const result = await Effect.runPromise(program);
      expect(result.people).toMatchObject({ persons: { count: 1 } });
      expect(result.transits).toHaveLength(2);
      expect(result.added["kpAscendant"]).toMatchObject({
        signLord: expect.any(String),
        starLord: expect.any(String),
        subLord: expect.any(String),
      });
      const eventsOf = (output: Record<string, unknown>) =>
        output["events"] as ReadonlyArray<Record<string, unknown>>;
      const [full] = eventsOf(result.transits[0] ?? {});
      const [brief] = eventsOf(result.summary);
      expect(full).toHaveProperty("chart");
      expect(brief).not.toHaveProperty("chart");

      // A crossing of house 1 is a hit on the natal cusp, not on the cusp at the search start.
      const [crossed] = eventsOf(result.crossing);
      const natalCusp = (result.added["kpAscendant"] as { longitude: number }).longitude;
      expect(crossed).toMatchObject({ kind: "cusp-crossing", house: 1 });
      expect(crossed?.["longitude"]).toBeCloseTo(natalCusp, 1);

      const failure = await Effect.runPromise(
        checkTransit({ name: "Ada", moment: "nope", planet: "Jupiter" }).pipe(Effect.flip),
      );
      expect(failure).toMatchObject({ _tag: "CommandError", code: "VALIDATION_ERROR" });
    } finally {
      process.chdir(previous);
      await rm(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});
