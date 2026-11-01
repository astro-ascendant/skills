import { Schema } from "effect";
import { Tool, Toolkit } from "effect/ai";

import { CommandError } from "./errors.ts";
import { toolSpecs } from "./tool-specs.ts";
import { addPerson, checkTransit, rulingPlanets } from "./workflows.ts";

/**
 * The tools as an `effect/ai` Toolkit, for the CLI and agent scripts. The
 * OpenCode host does not serve `effect/ai`, so the plugin uses `tool-specs.ts`
 * and `workflows.ts` directly and never imports this file.
 */

const Output = Schema.Record(Schema.String, Schema.Unknown);

export const AddPerson = Tool.make(toolSpecs.addPerson.name, {
  description: toolSpecs.addPerson.description,
  parameters: toolSpecs.addPerson.parameters,
  success: Output,
  failure: CommandError,
});

export const CheckTransit = Tool.make(toolSpecs.checkTransit.name, {
  description: toolSpecs.checkTransit.description,
  parameters: toolSpecs.checkTransit.parameters,
  success: Output,
  failure: CommandError,
});

export const RulingPlanets = Tool.make(toolSpecs.rulingPlanets.name, {
  description: toolSpecs.rulingPlanets.description,
  parameters: toolSpecs.rulingPlanets.parameters,
  success: Output,
  failure: CommandError,
});

export const AscendantToolkit = Toolkit.make(AddPerson, CheckTransit, RulingPlanets);

/** Handlers for the toolkit: typed input in, typed `CommandError` out. */
export const handlers = AscendantToolkit.of({
  ascendant_add_person: (input) => addPerson(input),
  ascendant_check_transit: (input) => checkTransit(input),
  ascendant_ruling_planets: (input) => rulingPlanets(input),
});
