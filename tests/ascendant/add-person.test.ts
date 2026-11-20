import { describe, expect, it } from "@effect/vitest";
import { Chart } from "astro-ascendant";
import { Effect, FileSystem, Path } from "effect";

import { PlatformLayer, Workspace } from "../../skills/ascendant/tools/common.ts";
import { addAda, inTempWorkspace } from "../support.ts";

const KP_ONLY_MARKERS = [
  "Star Lord",
  "Sub Lord",
  "Sub-Sub Lord",
  "Significations",
  "Significators",
  "Ruling Planets",
] as const;

const PARASHARI_SCHOOL = "| Parashari | Lahiri | WholeSign | Vimshottari |";
const KP_SCHOOL = "| KP | KrishnamurtiVP291 | Placidus | Vimshottari |";

const adaFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const personDirectory = path.join(yield* Workspace, "persons", "Ada");
  return {
    personDirectory,
    read: (...segments: ReadonlyArray<string>) =>
      fs.readFileString(path.join(personDirectory, ...segments)),
    write: (file: string, content: string) =>
      Effect.andThen(
        fs.makeDirectory(personDirectory, { recursive: true }),
        fs.writeFileString(path.join(personDirectory, file), content),
      ),
  };
}).pipe(Effect.provide(PlatformLayer));

describe("addPerson chart schools", () => {
  it.effect("keeps KP-only fields out of the Parashari vargas", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        const result = yield* addAda;
        expect(result.artifacts.charts).toBe(16);
        expect(result.artifacts.kpCharts).toBe(1);

        const { read } = yield* adaFiles;
        yield* Effect.forEach(Chart.Division.literals, (division) =>
          Effect.map(read("charts", `D${division}.md`), (varga) => {
            expect(varga.startsWith(`# Vedic Chart D${division}\n`)).toBe(true);
            expect(varga).toContain(PARASHARI_SCHOOL);
            expect(varga).toContain(
              "| House | Cusp | Point | Sign Lord | Longitude | Degree | Sign | Dignity | Retrograde |",
            );
            KP_ONLY_MARKERS.forEach((marker) => expect(varga).not.toContain(marker));
          }),
        );

        const kpD1 = yield* read("kp", "D1.md");
        expect(kpD1.startsWith("# KP Chart D1\n")).toBe(true);
        expect(kpD1).toContain(KP_SCHOOL);
        expect(kpD1).toContain("## Cusp Lords");
        expect(kpD1).toContain("## Planet Lords");
        expect(kpD1).toContain("Sub-Sub Lord");
        expect(kpD1).toContain("## House Significators");
        expect(kpD1).toContain("## Planet Significations");
        expect(kpD1).toContain("## Ruling Planets");

        const vedicDasha = yield* read("dasha.md");
        const kpDasha = yield* read("kp", "dasha.md");
        expect(vedicDasha).toContain("# Vimshottari Dasha");
        expect(vedicDasha).toContain(PARASHARI_SCHOOL);
        expect(vedicDasha).toContain("| Mahadasha | Start | End |");
        expect(kpDasha).toContain("# KP Vimshottari Dasha");
        expect(kpDasha).toContain(KP_SCHOOL);
        expect(kpDasha).toContain("| Mahadasha | Start | End |");

        yield* Effect.forEach(
          [
            [[], PARASHARI_SCHOOL],
            [["kp"], KP_SCHOOL],
          ] as const,
          ([folder, school]) =>
            Effect.gen(function* () {
              const pratyantar = yield* read(...folder, "pratyantardasha.md");
              const sookshma = yield* read(...folder, "sookshma.md");
              expect(pratyantar).toContain(school);
              expect(sookshma).toContain(school);
              expect(pratyantar.match(/^## .+ Pratyantardashas \(/gm)?.length).toBe(81);
              expect(sookshma.match(/^## .+ Sookshmas \(/gm)?.length).toBe(729);
              expect(pratyantar).toContain("| Pratyantardasha | Start | End |");
              expect(sookshma).toContain("| Sookshma | Start | End |");
            }),
        );

        const input = yield* read("input.md");
        expect(input).toContain("name: Ada");
        expect(input).toContain("| Field | Value |");
        expect(yield* read("sav.md")).toContain("# Sarvashtakavarga");
        expect(yield* read("jaimini", "chara-karakas.md")).toContain("# Chara Karakas");
      }),
    ),
  );

  it.effect("refuses a directory written by the retired TOON format", () =>
    inTempWorkspace(
      Effect.gen(function* () {
        const { write } = yield* adaFiles;
        yield* write(
          "input.toon",
          [
            "schemaVersion: 1",
            "name: Ada",
            'moment: "1990-01-01T12:00:00+05:30"',
            "latitude: 12.9716",
            "longitude: 77.5946",
            "",
          ].join("\n"),
        );

        const error = yield* Effect.flip(addAda);
        expect(error._tag).toBe("PersonRecordConflict");
        expect(error.message).toContain("input.md");
        expect(error.message).toContain("input.toon");
      }),
    ),
  );
});
