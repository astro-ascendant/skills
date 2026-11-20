import { describe, expect, it } from "@effect/vitest";
import { Chart, Transit } from "astro-ascendant";
import { Effect, Schema } from "effect";

import { searchTransits } from "../../skills/ascendant/tools/check-transit.ts";
import { OffsetMoment } from "../../skills/ascendant/tools/common.ts";
import { kpLordChain } from "../../skills/ascendant/tools/kp-lords.ts";
import { rulingPlanetsWorkflow } from "../../skills/ascendant/tools/ruling-planets.ts";
import { ADA, addAda, inTempWorkspace, KpLayer } from "../support.ts";

describe("ruling planets", () => {
  it.effect("returns five KP ruling planets with lord chains", () =>
    Effect.gen(function* () {
      const result = yield* rulingPlanetsWorkflow(
        Schema.decodeUnknownSync(OffsetMoment)("2026-09-23T10:00:00+05:30"),
        ADA.latitude,
        ADA.longitude,
      );

      expect(result.calculation).toEqual({
        school: "KP",
        ayanamsa: "KrishnamurtiVP291",
        houseSystem: "Placidus",
        dashaSystem: "Vimshottari",
      });
      expect(result.rulingPlanets).toHaveLength(5);
      expect(result.ascendant).toEqual({
        longitude: result.ascendant.longitude,
        ...kpLordChain(result.ascendant.longitude),
      });
      expect(result.moon).toEqual({
        longitude: result.moon.longitude,
        ...kpLordChain(result.moon.longitude),
      });
    }).pipe(Effect.provide(KpLayer)),
  );
});

describe("transit schools", () => {
  it.effect("KP school reports KP provenance and cusps", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        yield* addAda;
        const kp = yield* searchTransits(
          ADA.name,
          Schema.decodeUnknownSync(OffsetMoment)("2026-08-27T22:00:00+05:30"),
          {
            planet: Schema.decodeUnknownSync(Chart.Planets)("Jupiter"),
            school: "KP",
            direction: "forward",
            kinds: [Schema.decodeUnknownSync(Transit.TransitKind)("sign-ingress")],
            count: 1,
          },
        ).pipe(Effect.provide(KpLayer));
        expect(kp.calculation.school).toBe("KP");
        expect(kp.calculation.ayanamsa).toBe("KrishnamurtiVP291");
      }),
    ),
  );
});
