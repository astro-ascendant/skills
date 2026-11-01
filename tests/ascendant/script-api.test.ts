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
        yield* addPerson({
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
        return { people, transits };
      });

      const result = await Effect.runPromise(program);
      expect(result.people).toMatchObject({ persons: { count: 1 } });
      expect(result.transits).toHaveLength(2);

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
