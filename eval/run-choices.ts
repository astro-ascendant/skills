import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Console, Effect, FileSystem, Option, Path, Schema } from "effect";
import { Command, Flag } from "effect/cli";

import { ChoiceSet, evaluateChoices } from "./choices.ts";
import { parseDataset } from "./dataset.ts";
import { DEFAULT_OPTIONS, EvalLayer } from "./evaluate.ts";

const run = Command.make(
  "eval-choices",
  {
    data: Flag.String("data").pipe(Flag.withDescription("Dataset file, one person per line")),
    choices: Flag.String("choices").pipe(
      Flag.withDescription("Choice set file: question, options and each person's answer"),
    ),
    out: Flag.String("out").pipe(
      Flag.withDescription("Folder for the report (default eval/reports)"),
      Flag.optional,
    ),
    seed: Flag.Finite("seed").pipe(
      Flag.withDescription("Seed for the reassignment and resampling"),
      Flag.optional,
    ),
  },
  ({ data, choices, out, seed }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const dataset = parseDataset(yield* fs.readFileString(data));
      const choiceSet = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ChoiceSet))(
        yield* fs.readFileString(choices),
      );
      const report = yield* evaluateChoices(
        dataset.persons,
        choiceSet,
        Option.getOrElse(seed, () => DEFAULT_OPTIONS.seed),
      ).pipe(Effect.provide(EvalLayer));

      const directory = Option.getOrElse(out, () => path.join("eval", "reports"));
      const name = path.basename(choices).replace(/\.json$/, "");
      const file = path.join(directory, `${name}.${report.engine.replace("/", "-")}.json`);
      yield* fs.makeDirectory(directory, { recursive: true });
      yield* fs.writeFileString(file, `${JSON.stringify(report, null, 2)}\n`);

      yield* Console.log(
        `${report.engine} on "${report.question}": ${report.people} people, ${report.options.length} options, ${report.charts} charts`,
      );
      yield* Effect.forEach(report.variants, (variant) =>
        Effect.gen(function* () {
          yield* Console.log(`\nHouses ${variant.houses}`);
          yield* Console.table({ topChoice: variant.topChoice });
          yield* Console.table({ margin: variant.margin });
          yield* Console.table(variant.people);
        }),
      );
      yield* Console.error(`\nWrote ${file}`);
    }),
).pipe(
  Command.withDescription("Test whether the promise rule picks the option a person really chose"),
);

run.pipe(Command.run({ version: "1" }), Effect.provide(BunServices.layer), BunRuntime.runMain);
