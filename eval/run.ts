import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Console, Effect, FileSystem, Option, Path } from "effect";
import { Command, Flag } from "effect/cli";

import { parseDataset } from "./dataset.ts";
import { DEFAULT_OPTIONS, evaluate, EvalLayer, renderReport } from "./evaluate.ts";

const run = Command.make(
  "eval",
  {
    data: Flag.String("data").pipe(Flag.withDescription("Dataset file, one person per line")),
    out: Flag.String("out").pipe(
      Flag.withDescription("Folder for the report (default eval/reports)"),
      Flag.optional,
    ),
    shiftHours: Flag.Finite("shift-hours").pipe(
      Flag.withDescription("Hours added to birth times for the shifted control (default 6)"),
      Flag.optional,
    ),
    seed: Flag.Finite("seed").pipe(
      Flag.withDescription("Seed for the resampling behind the intervals"),
      Flag.optional,
    ),
  },
  ({ data, out, shiftHours, seed }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const dataset = parseDataset(yield* fs.readFileString(data));
      yield* Effect.forEach(dataset.problems, (problem) => Console.error(`dropped: ${problem}`));

      const report = yield* evaluate(dataset, {
        shiftHours: Option.getOrElse(shiftHours, () => DEFAULT_OPTIONS.shiftHours),
        seed: Option.getOrElse(seed, () => DEFAULT_OPTIONS.seed),
        skyStepDays: DEFAULT_OPTIONS.skyStepDays,
      }).pipe(Effect.provide(EvalLayer));

      const directory = Option.getOrElse(out, () => path.join("eval", "reports"));
      const name = path.basename(data).replace(/\.jsonl$/, "");
      const stem = path.join(directory, `${name}.${report.engine.replace("/", "-")}`);
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
      yield* fs.writeFileString(`${stem}.md`, renderReport(report, name));

      yield* Console.log(
        `${report.engine} on ${name}: ${report.dataset.persons} people, ${report.dataset.cases} events, ${report.dataset.dropped} dropped`,
      );
      yield* Console.log(report.conclusion);
      yield* Console.log("\nComparisons (log score gain, 95% range)");
      yield* Console.table(report.comparisons, ["name", "logScoreGain", "low", "high", "result"]);
      yield* Console.log("\nModels");
      yield* Console.table(report.models);
      yield* Console.log("\nEvents on a qualifying day, against chance");
      yield* Console.table(report.periodHits);
      yield* Console.log("\nPromise rule on events that happened");
      yield* Console.table(report.promise);
      yield* Console.log("\nBy event (log score)");
      yield* Console.table(report.byEvent);
      yield* Console.error(`\nWrote ${stem}.json and ${stem}.md`);
    }),
).pipe(Command.withDescription("Score the KP judge against baselines on a dataset"));

run.pipe(Command.run({ version: "1" }), Effect.provide(BunServices.layer), BunRuntime.runMain);
