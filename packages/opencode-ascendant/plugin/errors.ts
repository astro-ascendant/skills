import { Tool } from "@opencode/schema/tool";
import { Match, Schema } from "effect";

import { CommandError } from "../skills/ascendant/tools/errors.ts";

export class WorkingDirectoryError extends Schema.TaggedError<WorkingDirectoryError>()(
  "WorkingDirectoryError",
  {
    directory: Schema.String,
    message: Schema.String,
  },
) {}

export const describeCause = (cause: unknown): string =>
  Match.value(cause).pipe(
    Match.when(Match.instanceOf(Error), (error) => error.message),
    Match.orElse((other) => String(other)),
  );

export const toToolError = (error: unknown) =>
  Tool.Error.make({
    message: Match.value(error).pipe(
      Match.when(Match.instanceOf(CommandError), (command) =>
        [command.message, `code: ${command.code}`, ...command.suggestions].join("\n"),
      ),
      Match.orElse(describeCause),
    ),
  });
