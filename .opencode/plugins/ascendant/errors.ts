import { Tool } from "@opencode/schema/tool";

import { CommandError } from "../../../skills/ascendant/tools/errors.ts";

export const describeCause = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export const toToolError = (error: unknown) =>
  Tool.Error.make({
    message:
      error instanceof CommandError
        ? [`${error.message}`, `code: ${error.code}`, ...error.suggestions].join("\n")
        : describeCause(error),
  });
