import type { Plugin } from "@opencode/plugin/effect";
import { encode } from "@toon-format/toon";
import { Effect } from "effect";

import { toolSpecs } from "../skills/ascendant/tools/tool-specs.ts";
import {
  addPerson,
  checkTransit,
  rulingPlanets,
} from "../skills/ascendant/tools/workflows.ts";
import { makeDirectoryRunner } from "./directory.ts";
import { toToolError } from "./errors.ts";

const TOOL_TIMEOUT_MS = 60_000;

export const registerTools = Effect.fn("Ascendant.registerTools")(function* (
  ctx: Plugin.Context,
  runInDirectory: ReturnType<typeof makeDirectoryRunner>,
) {
  const run = <A extends Record<string, unknown>, E>(effect: Effect.Effect<A, E>) =>
    runInDirectory(effect).pipe(
      Effect.map((output) => ({ content: encode(output) })),
      Effect.timeout(TOOL_TIMEOUT_MS),
      Effect.mapError(toToolError),
    );

  yield* ctx.tool.transform((editor) => {
    editor.add({
      name: toolSpecs.addPerson.name,
      description: toolSpecs.addPerson.description,
      input: toolSpecs.addPerson.parameters,
      execute: (args) => run(addPerson(args)),
    });
    editor.add({
      name: toolSpecs.checkTransit.name,
      description: toolSpecs.checkTransit.description,
      input: toolSpecs.checkTransit.parameters,
      execute: (args) => run(checkTransit(args)),
    });
    editor.add({
      name: toolSpecs.rulingPlanets.name,
      description: toolSpecs.rulingPlanets.description,
      input: toolSpecs.rulingPlanets.parameters,
      execute: (args) => run(rulingPlanets(args)),
    });
  });
});
