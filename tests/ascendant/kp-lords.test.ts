import { describe, expect, it } from "@effect/vitest";

import {
  dmsOf,
  signDegreeOf,
  signLordOf,
  starLordOf,
  subLordOf,
  subSubLordOf,
} from "../../skills/ascendant/tools/kp-lords.ts";

describe("kp lord chain", () => {
  it("starts Ashwini with Ketu as star lord", () => {
    expect(starLordOf(0)).toBe("Ketu");
    expect(subLordOf(0)).toBe("Ketu");
    expect(subSubLordOf(0)).toBe("Ketu");
  });

  it("moves to Venus sub after Ketu's 7/120 of Ashwini", () => {
    const insideVenusSub = (7 / 120) * (360 / 27) + 1e-9;
    expect(subLordOf(insideVenusSub)).toBe("Venus");
    expect(subSubLordOf(insideVenusSub)).toBe("Venus");
  });

  it("exposes sign-relative position for table lookup", () => {
    expect(signLordOf(324)).toBe("Saturn");
    expect(signDegreeOf(324)).toBeCloseTo(24, 10);
    expect(dmsOf(324)).toBe("24°00'00\"");
  });
});
