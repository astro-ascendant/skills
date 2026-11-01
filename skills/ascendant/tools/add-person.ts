import {
  Argala,
  ArudhaPada,
  Chart,
  CharaKarakas,
  Dasha,
  Karakamsha,
  RashiDrishti,
  SAV,
  Upapada,
} from "astro-ascendant";
import { DateTime, Effect, FileSystem, Path } from "effect";

import {
  calculationContext,
  decodeMoment,
  KpAstroParamsLayer,
  type Latitude,
  type Longitude,
  type OffsetMoment,
  type PersonName,
  type Sex,
  PersonRecordConflict,
  personRecordMatches,
  readStoredPerson,
  writeMarkdown,
  type StoredPerson,
} from "./common.ts";
import { kpCuspAndPlanetLords } from "./kp-lords.ts";
import { markdownTable } from "./markdown.ts";

export interface PersonAddition {
  readonly person: {
    readonly name: string;
    readonly path: string;
    readonly status: "created" | "refreshed";
  };
  readonly artifacts: {
    readonly charts: number;
    readonly kpCharts: number;
    readonly dashas: number;
    readonly jaimini: number;
  };
}

function formatMemory(storedPerson: StoredPerson): string {
  return [
    "---",
    `name: ${storedPerson.name}`,
    `birth: ${storedPerson.moment}`,
    `latitude: ${storedPerson.latitude}`,
    `longitude: ${storedPerson.longitude}`,
    ...(storedPerson.sex !== undefined ? [`sex: ${storedPerson.sex}`] : []),
    "---",
    "",
  ].join("\n");
}

function formatInputMarkdown(storedPerson: StoredPerson): string {
  const rows: Array<readonly [string, string | number]> = [
    ["name", storedPerson.name],
    ["birth", storedPerson.moment],
    ["latitude", storedPerson.latitude],
    ["longitude", storedPerson.longitude],
  ];
  if (storedPerson.sex !== undefined) rows.push(["sex", storedPerson.sex]);
  rows.push(["schemaVersion", storedPerson.schemaVersion]);
  return [
    "---",
    `schemaVersion: ${storedPerson.schemaVersion}`,
    `name: ${storedPerson.name}`,
    `birth: ${storedPerson.moment}`,
    `latitude: ${storedPerson.latitude}`,
    `longitude: ${storedPerson.longitude}`,
    ...(storedPerson.sex !== undefined ? [`sex: ${storedPerson.sex}`] : []),
    "---",
    "",
    `# Input: ${storedPerson.name}`,
    "",
    markdownTable(
      ["Field", "Value"],
      rows.map((row) => [row[0], row[1]]),
    ),
    "",
  ].join("\n");
}

function calculationTable(calculation: ReturnType<typeof calculationContext>): string {
  return markdownTable(
    ["School", "Ayanamsa", "House system", "Dasha system"],
    [[calculation.school, calculation.ayanamsa, calculation.houseSystem, calculation.dashaSystem]],
  );
}

/**
 * Parashari houses table. KP's four-lord chain (star/sub/sub-sub) belongs to
 * `kp/D1.md`; a varga has no KP sub-divisions at all, so this table carries
 * only the rashi lord plus placement data.
 */
function houseTable(chart: Chart.Chart): string {
  const rows: Array<ReadonlyArray<string | number | boolean>> = [];
  for (const house of Chart.Houses.literals) {
    const houseData = chart.houses[house];
    const cusp = houseData.cusp;
    const before = rows.length;

    if (houseData.lagna !== null) {
      const lagna = houseData.lagna;
      rows.push([
        house,
        cusp,
        lagna.name,
        lagna.sign.lord,
        lagna.longitude,
        lagna.degree,
        lagna.sign.name,
        "-",
        "-",
      ]);
    }

    for (const planet of houseData.planets) {
      rows.push([
        house,
        cusp,
        planet.name,
        planet.sign.lord,
        planet.longitude,
        planet.degree,
        planet.sign.name,
        planet.in_sign.join(", ") || "-",
        planet.is_retrograde,
      ]);
    }

    if (rows.length === before) {
      rows.push([house, cusp, "-", houseData.signLord, "-", "-", houseData.sign, "-", "-"]);
    }
  }
  return markdownTable(
    ["House", "Cusp", "Point", "Sign Lord", "Longitude", "Degree", "Sign", "Dignity", "Retrograde"],
    rows,
  );
}

function planetSignificationTable(chart: Chart.D1Chart): string {
  if (chart.planetSignifications === undefined) return "";
  const rows = Object.entries(chart.planetSignifications).map(([planet, signification]) => [
    planet,
    signification.level1.join(", ") || "-",
    signification.level2.join(", ") || "-",
    signification.level3.join(", ") || "-",
    signification.level4.join(", ") || "-",
  ]);
  return markdownTable(["Planet", "Level 1", "Level 2", "Level 3", "Level 4"], rows);
}

function houseSignificatorTable(chart: Chart.D1Chart): string {
  if (chart.houseSignificators === undefined) return "";
  const rows = Object.entries(chart.houseSignificators).map(([house, significators]) => [
    Number(house),
    significators.level1.join(", ") || "-",
    significators.level2.join(", ") || "-",
    significators.level3.join(", ") || "-",
    significators.level4.join(", ") || "-",
  ]);
  return markdownTable(["House", "Level 1", "Level 2", "Level 3", "Level 4"], rows);
}

function rulingPlanetsTable(chart: Chart.D1Chart): string {
  return markdownTable(
    ["Rank", "Planet"],
    (chart.rulingPlanets ?? []).map((planet, index) => [index + 1, planet]),
  );
}

function formatChartMarkdown(
  school: string,
  calculation: ReturnType<typeof calculationContext>,
  chart: Chart.Chart,
): string {
  return [
    `# ${school} Chart D${chart.division}`,
    "",
    calculationTable(calculation),
    "",
    "## Houses",
    "",
    houseTable(chart),
    "",
  ].join("\n");
}

function formatDashaMarkdown(
  title: string,
  calculation: ReturnType<typeof calculationContext>,
  dashas: Effect.Success<ReturnType<typeof Dasha.calculate>>,
): string {
  const sections = [
    `# ${title}`,
    "",
    calculationTable(calculation),
    "",
    "## Vimshottari Mahadashas",
    "",
    markdownTable(
      ["Mahadasha", "Start", "End"],
      dashas.map((period) => [
        period.mahadasha,
        DateTime.formatIso(period.start),
        DateTime.formatIso(period.end),
      ]),
    ),
  ];
  for (const period of dashas) {
    sections.push(
      "",
      `## ${period.mahadasha} Mahadasha Antardashas (${DateTime.formatIso(period.start)} to ${DateTime.formatIso(period.end)})`,
      "",
      markdownTable(
        ["Antardasha", "Start", "End"],
        period.antardashas.map((antardasha) => [
          antardasha.antardasha,
          DateTime.formatIso(antardasha.start),
          DateTime.formatIso(antardasha.end),
        ]),
      ),
    );
  }
  sections.push("");
  return sections.join("\n");
}

function formatSavMarkdown(result: Effect.Success<ReturnType<typeof SAV.calculate>>): string {
  const rashis = Object.keys(result.sarva);
  const bhinnaPlanets = [
    "Sun",
    "Moon",
    "Mars",
    "Mercury",
    "Jupiter",
    "Venus",
    "Saturn",
    "Lagna",
  ] as const;
  const reducedPlanets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"] as const;
  return [
    "# Sarvashtakavarga",
    "",
    "## Bhinnashtakavarga and Sarvashtakavarga",
    "",
    markdownTable(
      ["Rashi", ...bhinnaPlanets, "SAV"],
      rashis.map((rashi) => [
        rashi,
        ...bhinnaPlanets.map((planet) => result.bhinna[planet][rashi as keyof typeof result.sarva]),
        result.sarva[rashi as keyof typeof result.sarva],
      ]),
    ),
    "",
    "## Reduced Bhinnashtakavarga",
    "",
    markdownTable(
      ["Rashi", ...reducedPlanets],
      rashis.map((rashi) => [
        rashi,
        ...reducedPlanets.map(
          (planet) => result.reduced[planet][rashi as keyof typeof result.sarva],
        ),
      ]),
    ),
    "",
    "## Shodhya Pinda",
    "",
    markdownTable(
      ["Planet", "Rashi Pinda", "Graha Pinda", "Shodhya Pinda"],
      reducedPlanets.map((planet) => [
        planet,
        result.shodhya_pinda[planet].rashi_pinda,
        result.shodhya_pinda[planet].graha_pinda,
        result.shodhya_pinda[planet].shodhya_pinda,
      ]),
    ),
    "",
    "## Classical checksums",
    "",
    markdownTable(
      ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Lagna", "SAV"],
      [
        [
          result.totals.Sun,
          result.totals.Moon,
          result.totals.Mars,
          result.totals.Mercury,
          result.totals.Jupiter,
          result.totals.Venus,
          result.totals.Saturn,
          result.totals.Lagna,
          result.totals.sarva,
        ],
      ],
    ),
    "",
  ].join("\n");
}

function formatKpD1Markdown(
  calculation: ReturnType<typeof calculationContext>,
  chart: Chart.D1Chart,
): string {
  const kpLords = kpCuspAndPlanetLords(chart);
  const sections = [
    `# KP Chart D${chart.division}`,
    "",
    calculationTable(calculation),
    "",
    "## Cusp Lords",
    "",
    markdownTable(
      [
        "House",
        "Longitude",
        "DMS",
        "Sign",
        "Star",
        "Pada",
        "Sign Lord",
        "Star Lord",
        "Sub Lord",
        "Sub-Sub Lord",
        "Significations",
      ],
      kpLords.cuspLords.map((cusp) => [
        cusp.house,
        Number(cusp.longitude.toFixed(4)),
        cusp.dms,
        cusp.sign,
        cusp.star,
        cusp.pada,
        cusp.signLord,
        cusp.starLord,
        cusp.subLord,
        cusp.subSubLord,
        chart.houses[cusp.house]?.significations?.join(", ") || "-",
      ]),
    ),
    "",
    "## Planet Lords",
    "",
    markdownTable(
      [
        "Name",
        "House",
        "Longitude",
        "DMS",
        "Sign",
        "Star",
        "Pada",
        "Sign Lord",
        "Star Lord",
        "Sub Lord",
        "Sub-Sub Lord",
      ],
      kpLords.planetLords.map((planet) => [
        planet.name,
        planet.house,
        Number(planet.longitude.toFixed(4)),
        planet.dms,
        planet.sign,
        planet.star,
        planet.pada,
        planet.signLord,
        planet.starLord,
        planet.subLord,
        planet.subSubLord,
      ]),
    ),
  ];
  const planetTable = planetSignificationTable(chart);
  if (planetTable !== "") sections.push("", "## Planet Significations", "", planetTable);
  const houseTableText = houseSignificatorTable(chart);
  if (houseTableText !== "") sections.push("", "## House Significators", "", houseTableText);
  sections.push("", "## Ruling Planets", "", rulingPlanetsTable(chart), "");
  return sections.join("\n");
}

function formatCharaKarakasMarkdown(
  result: Effect.Success<ReturnType<typeof CharaKarakas.calculate>>,
): string {
  return [
    "# Chara Karakas",
    "",
    markdownTable(
      ["Role", "Planet", "Degree"],
      CharaKarakas.Roles.literals.map((role) => [
        role,
        result.assignments[role].map(({ planet }) => planet).join(", "),
        result.assignments[role].map(({ degree }) => `${degree}°`).join(", "),
      ]),
    ),
    "",
  ].join("\n");
}

function formatRashiDrishtiMarkdown(
  lagnaSign: string,
  result: Effect.Success<ReturnType<typeof RashiDrishti.calculate>>,
): string {
  return [
    `# Rashi Drishti from ${lagnaSign}`,
    "",
    markdownTable(
      ["Target"],
      result.targets.map((target) => [target]),
    ),
    "",
  ].join("\n");
}

function formatKarakamshaMarkdown(
  result: Effect.Success<ReturnType<typeof Karakamsha.calculate>>,
): string {
  return [
    "# Karakamsha",
    "",
    markdownTable(
      ["Planet", "Sign"],
      result.placements.map(({ planet, sign }) => [planet, sign]),
    ),
    "",
  ].join("\n");
}

function formatArudhaPadasMarkdown(
  results: ReadonlyArray<Effect.Success<ReturnType<typeof ArudhaPada.calculate>>>,
): string {
  return [
    "# Arudha Padas",
    "",
    markdownTable(
      ["House", "Sign"],
      results.map((result, index) => [`A${index + 1}`, result.sign]),
    ),
    "",
  ].join("\n");
}

function formatUpapadaMarkdown(
  result: Effect.Success<ReturnType<typeof Upapada.calculate>>,
): string {
  return ["# Upapada (A12)", "", markdownTable(["Sign"], [[result.sign]]), ""].join("\n");
}

function formatArgalaMarkdown(result: Effect.Success<ReturnType<typeof Argala.calculate>>): string {
  return [
    `# Argala from ${result.referenceSign}`,
    "",
    markdownTable(
      ["Kind", "Position", "Sign", "Planets"],
      [
        ...result.supporting.map((relation) => [
          "Supporting",
          relation.position,
          relation.sign,
          relation.planets.join(", ") || "-",
        ]),
        ...result.obstructing.map((relation) => [
          "Obstructing",
          relation.position,
          relation.sign,
          relation.planets.join(", ") || "-",
        ]),
        [
          "Secondary supporting",
          result.secondarySupporting.position,
          result.secondarySupporting.sign,
          result.secondarySupporting.planets.join(", ") || "-",
        ],
        [
          "Secondary obstructing",
          result.secondaryObstructing.position,
          result.secondaryObstructing.sign,
          result.secondaryObstructing.planets.join(", ") || "-",
        ],
      ],
    ),
    "",
  ].join("\n");
}

export const addPerson = Effect.fn("Ascendant.addPerson")(function* (storedPerson: StoredPerson) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const personDirectory = path.join("persons", storedPerson.name);
  const inputFile = path.join(personDirectory, "input.md");
  const personDirectoryExists = yield* fs.exists(personDirectory);

  if (personDirectoryExists) {
    if (!(yield* fs.exists(inputFile))) {
      return yield* PersonRecordConflict.make({
        directory: personDirectory,
        message:
          `${personDirectory} exists but has no input.md. Records written by older versions ` +
          "(input.txt, input.toon, input.json) are no longer read; move or delete the directory, " +
          "then run add again",
      });
    }

    const current = yield* readStoredPerson(storedPerson.name);
    if (!personRecordMatches(current, storedPerson)) {
      return yield* PersonRecordConflict.make({
        directory: personDirectory,
        message:
          "The person already exists with different birth data; choose another name or move the existing record",
      });
    }
  }

  const birthDate = yield* decodeMoment(storedPerson.moment);
  const birthMoment = Chart.Moment.make({ date: birthDate });
  const chartParams = {
    moment: birthMoment,
    latitude: storedPerson.latitude,
    longitude: storedPerson.longitude,
    ...(storedPerson.sex !== undefined ? { sex: storedPerson.sex } : {}),
  };
  const [vedicCalculation, kpCalculation] = yield* Effect.all(
    [
      Chart.generate(chartParams, Chart.Division.literals),
      Chart.generate(chartParams, []).pipe(Effect.provide(KpAstroParamsLayer)),
    ],
    { concurrency: "unbounded" },
  );
  const placements = vedicCalculation.placements;
  const kpPlacements = kpCalculation.placements;

  const [dasha, kpDasha, sav] = yield* Effect.all(
    [
      Dasha.calculate(birthMoment, placements),
      Dasha.calculate(birthMoment, kpPlacements),
      SAV.calculate(placements),
    ],
    { concurrency: "unbounded" },
  );

  const d1 = vedicCalculation.charts[0];
  const kpD1 = kpCalculation.charts[0];
  const lagnaSign = d1.houses[1].sign;
  const [charaKarakas, rashiDrishti, karakamsha, arudhaPadas, upapada, argala] = yield* Effect.all(
    [
      CharaKarakas.calculate(placements),
      RashiDrishti.calculate(lagnaSign),
      Karakamsha.calculate(placements),
      Effect.all(
        Chart.Houses.literals.map((house) => ArudhaPada.calculate(placements, house)),
        { concurrency: "unbounded" },
      ),
      Upapada.calculate(placements),
      Argala.calculate(placements, {
        kind: "Sign",
        sign: lagnaSign,
      }),
    ],
    { concurrency: "unbounded" },
  );

  const chartsDirectory = path.join(personDirectory, "charts");
  const kpDirectory = path.join(personDirectory, "kp");
  const jaiminiDirectory = path.join(personDirectory, "jaimini");
  const memoryFile = path.join(personDirectory, "MEMORY.md");
  yield* fs.makeDirectory(chartsDirectory, { recursive: true });
  yield* fs.makeDirectory(kpDirectory, { recursive: true });
  yield* fs.makeDirectory(jaiminiDirectory, { recursive: true });
  if (!(yield* fs.exists(memoryFile))) {
    yield* fs.writeFileString(memoryFile, formatMemory(storedPerson));
  }

  const vedicContext = calculationContext("Parashari", vedicCalculation.astroParams);
  const kpContext = calculationContext("KP", kpCalculation.astroParams);

  yield* Effect.all(
    vedicCalculation.charts.map((chart) =>
      writeMarkdown(
        path.join(chartsDirectory, `D${chart.division}.md`),
        formatChartMarkdown("Vedic", vedicContext, chart),
      ),
    ),
    { concurrency: "unbounded" },
  );

  yield* Effect.all(
    [
      writeMarkdown(inputFile, formatInputMarkdown(storedPerson)),
      writeMarkdown(
        path.join(personDirectory, "dasha.md"),
        formatDashaMarkdown("Vimshottari Dasha", vedicContext, dasha),
      ),
      writeMarkdown(path.join(personDirectory, "sav.md"), formatSavMarkdown(sav)),
      writeMarkdown(path.join(kpDirectory, "D1.md"), formatKpD1Markdown(kpContext, kpD1)),
      writeMarkdown(
        path.join(kpDirectory, "dasha.md"),
        formatDashaMarkdown("KP Vimshottari Dasha", kpContext, kpDasha),
      ),
      writeMarkdown(
        path.join(jaiminiDirectory, "chara-karakas.md"),
        formatCharaKarakasMarkdown(charaKarakas),
      ),
      writeMarkdown(
        path.join(jaiminiDirectory, "rashi-drishti.md"),
        formatRashiDrishtiMarkdown(lagnaSign, rashiDrishti),
      ),
      writeMarkdown(
        path.join(jaiminiDirectory, "karakamsha.md"),
        formatKarakamshaMarkdown(karakamsha),
      ),
      writeMarkdown(
        path.join(jaiminiDirectory, "arudha-padas.md"),
        formatArudhaPadasMarkdown(arudhaPadas),
      ),
      writeMarkdown(path.join(jaiminiDirectory, "upapada.md"), formatUpapadaMarkdown(upapada)),
      writeMarkdown(path.join(jaiminiDirectory, "argala.md"), formatArgalaMarkdown(argala)),
    ],
    { concurrency: "unbounded" },
  );

  return {
    person: {
      name: storedPerson.name,
      path: personDirectory,
      status: personDirectoryExists ? "refreshed" : "created",
    },
    artifacts: {
      charts: vedicCalculation.charts.length,
      kpCharts: kpCalculation.charts.length,
      dashas: dasha.length,
      jaimini: 6,
    },
  } satisfies PersonAddition;
});

export const addPersonFromInput = Effect.fn("Ascendant.addPersonFromInput")(function* (
  name: PersonName,
  moment: OffsetMoment,
  latitude: Latitude,
  longitude: Longitude,
  sex?: Sex,
) {
  const birthDate = yield* decodeMoment(moment);
  const storedPerson: StoredPerson = {
    schemaVersion: 1,
    name,
    moment: DateTime.formatIso(birthDate),
    latitude,
    longitude,
    ...(sex !== undefined ? { sex } : {}),
  };

  return yield* addPerson(storedPerson);
});
