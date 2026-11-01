import { Runtime, Schema } from "effect";

/**
 * The one failure every Ascendant tool reports. `code` is stable for agents
 * to branch on; `suggestions` are next commands to try. Failing with it ends
 * the CLI with the matching exit code (2 for validation, 1 otherwise).
 */
export class CommandError extends Schema.TaggedError<CommandError>()("CommandError", {
  message: Schema.String,
  code: Schema.String,
  suggestions: Schema.Array(Schema.String),
}) {
  get [Runtime.errorExitCode](): number {
    return this.code === "VALIDATION_ERROR" ? 2 : 1;
  }
}

/** The TOON-ready report printed for any failure. */
export const failureReport = (error: unknown) =>
  error instanceof CommandError
    ? { error: error.message, code: error.code, help: error.suggestions }
    : { error: String(error), code: "UNKNOWN", help: [] as ReadonlyArray<string> };
