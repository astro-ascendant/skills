import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Chart } from "astro-ascendant";
import { Effect, Schema } from "effect";

import {
  AppLayer,
  Latitude,
  Longitude,
  OffsetMoment,
  PersonName,
} from "../../skills/ascendant/tools/common.ts";
import { addPersonFromInput } from "../../skills/ascendant/tools/add-person.ts";

const ADA = {
  name: Schema.decodeUnknownSync(PersonName)("Ada"),
  moment: Schema.decodeUnknownSync(OffsetMoment)("1990-01-01T12:00:00+05:30"),
  latitude: Schema.decodeUnknownSync(Latitude)(12.9716),
  longitude: Schema.decodeUnknownSync(Longitude)(77.5946),
} as const;

/** Fields that only exist in KP: cuspal sub-divisions, significations, ruling planets. */
const KP_ONLY_MARKERS = [
  "Star Lord",
  "Sub Lord",
  "Sub-Sub Lord",
  "Significations",
  "Significators",
  "Ruling Planets",
] as const;

describe("addPerson chart schools", () => {
  test("keeps KP-only fields out of the Parashari vargas", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ascendant-a311-"));
    const previous = process.cwd();
    process.chdir(workspace);

    try {
      const result = await Effect.runPromise(
        addPersonFromInput(ADA.name, ADA.moment, ADA.latitude, ADA.longitude).pipe(
          Effect.provide(AppLayer),
        ),
      );

      expect(result.artifacts.charts).toBe(16);
      expect(result.artifacts.kpCharts).toBe(1);

      const personDirectory = join(workspace, "persons", "Ada");
      const kpD1 = await readFile(join(personDirectory, "kp", "D1.md"), "utf8");

      for (const division of Chart.Division.literals) {
        const varga = await readFile(join(personDirectory, "charts", `D${division}.md`), "utf8");
        expect(varga.startsWith(`# Vedic Chart D${division}\n`)).toBe(true);
        expect(varga).toContain("| Parashari | Lahiri | WholeSign | Vimshottari |");
        expect(varga).toContain(
          "| House | Cusp | Point | Sign Lord | Longitude | Degree | Sign | Dignity | Retrograde |",
        );
        for (const marker of KP_ONLY_MARKERS) {
          expect(varga).not.toContain(marker);
        }
      }

      expect(kpD1.startsWith("# KP Chart D1\n")).toBe(true);
      expect(kpD1).toContain("| KP | KrishnamurtiVP291 | Placidus | Vimshottari |");
      expect(kpD1).toContain("## Cusp Lords");
      expect(kpD1).toContain("## Planet Lords");
      expect(kpD1).toContain("Sub-Sub Lord");
      expect(kpD1).toContain("## House Significators");
      expect(kpD1).toContain("## Planet Significations");
      expect(kpD1).toContain("## Ruling Planets");

      const vedicDasha = await readFile(join(personDirectory, "dasha.md"), "utf8");
      const kpDasha = await readFile(join(personDirectory, "kp", "dasha.md"), "utf8");
      expect(vedicDasha).toContain("# Vimshottari Dasha");
      expect(vedicDasha).toContain("| Parashari | Lahiri | WholeSign | Vimshottari |");
      expect(vedicDasha).toContain("| Mahadasha | Start | End |");
      expect(kpDasha).toContain("# KP Vimshottari Dasha");
      expect(kpDasha).toContain("| KP | KrishnamurtiVP291 | Placidus | Vimshottari |");
      expect(kpDasha).toContain("| Mahadasha | Start | End |");

      const input = await readFile(join(personDirectory, "input.md"), "utf8");
      const sav = await readFile(join(personDirectory, "sav.md"), "utf8");
      const charaKarakas = await readFile(
        join(personDirectory, "jaimini", "chara-karakas.md"),
        "utf8",
      );
      expect(input).toContain("name: Ada");
      expect(input).toContain("| Field | Value |");
      expect(sav).toContain("# Sarvashtakavarga");
      expect(charaKarakas).toContain("# Chara Karakas");
    } finally {
      process.chdir(previous);
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("refuses a directory written by the retired TOON format", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ascendant-legacy-"));
    const previous = process.cwd();
    process.chdir(workspace);

    try {
      const personDirectory = join(workspace, "persons", "Ada");
      await mkdir(personDirectory, { recursive: true });
      await writeFile(
        join(personDirectory, "input.toon"),
        [
          "schemaVersion: 1",
          "name: Ada",
          'moment: "1990-01-01T12:00:00+05:30"',
          "latitude: 12.9716",
          "longitude: 77.5946",
          "",
        ].join("\n"),
      );

      const error = await Effect.runPromise(
        addPersonFromInput(ADA.name, ADA.moment, ADA.latitude, ADA.longitude).pipe(
          Effect.provide(AppLayer),
          Effect.flip,
        ),
      );

      if (error._tag !== "PersonRecordConflict") {
        throw new Error(`expected PersonRecordConflict, received ${error._tag}`);
      }
      expect(error.message).toContain("input.md");
      expect(error.message).toContain("input.toon");
    } finally {
      process.chdir(previous);
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
