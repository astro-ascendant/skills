import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import { Effect } from "effect";

import { cli } from "./cli.ts";

// Failures print their own TOON report and carry their exit code, so the
// runtime's default error log would only repeat them.
cli.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain({ disableErrorReporting: true }));
