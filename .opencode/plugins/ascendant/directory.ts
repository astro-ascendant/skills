import { Effect, Semaphore } from "effect";

import { describeCause, WorkingDirectoryError } from "./errors.ts";

/**
 * Serialize working-directory-sensitive runs: the workflows resolve
 * `persons/` against the process cwd, so concurrent calls for different
 * projects must not interleave a shared chdir.
 */
export function makeDirectoryRunner(mutex: Semaphore.Semaphore, directory: string) {
  return <A, E>(
    effect: Effect.Effect<A, E, never>,
  ): Effect.Effect<A, E | WorkingDirectoryError, never> =>
    Semaphore.withPermits(
      mutex,
      1,
    )(
      Effect.acquireUseRelease(
        Effect.try({
          try: () => {
            const previous = process.cwd();
            if (previous !== directory) process.chdir(directory);
            return previous;
          },
          catch: (cause) =>
            new WorkingDirectoryError({
              directory,
              message: `Unable to use working directory ${directory}: ${describeCause(cause)}`,
            }),
        }),
        () => effect,
        (previous) =>
          Effect.sync(() => {
            if (process.cwd() !== previous) process.chdir(previous);
          }),
      ),
    );
}
