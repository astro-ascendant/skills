import * as NodePath from "node:path";
import * as NodeUrl from "node:url";
import { Effect, Layer, Option, Path } from "effect";
import { BadArgument } from "effect/PlatformError";

const fromFileUrl = (url: URL): Effect.Effect<string, BadArgument> =>
  Effect.try({
    try: () => NodeUrl.fileURLToPath(url),
    catch: (cause) =>
      new BadArgument({
        module: "Path",
        method: "fromFileUrl",
        cause,
      }),
  });

const toFileUrl = (path: string): Effect.Effect<URL, BadArgument> =>
  Effect.try({
    try: () => NodeUrl.pathToFileURL(path),
    catch: (cause) =>
      new BadArgument({
        module: "Path",
        method: "toFileUrl",
        cause,
      }),
  });

const PathService: Path.Path = {
  [Path.TypeId]: Path.TypeId,
  sep: NodePath.sep,
  basename: NodePath.basename,
  dirname: NodePath.dirname,
  extname: NodePath.extname,
  format: NodePath.format,
  fromFileUrl,
  isAbsolute: NodePath.isAbsolute,
  join: NodePath.join,
  normalize: NodePath.normalize,
  parse: NodePath.parse,
  relative: NodePath.relative,
  resolve: NodePath.resolve,
  // Mirrors `make` from `effect/Path`: derive `resolveWithin` from the
  // implementation above instead of importing `make` (absent on host).
  resolveWithin(root, input) {
    if (NodePath.parse(input).root !== "") return Option.none();
    const base = NodePath.resolve(root);
    const candidate = NodePath.resolve(base, input);
    const relative = NodePath.relative(base, candidate);
    return relative === ".." ||
      relative.startsWith(`..${NodePath.sep}`) ||
      NodePath.isAbsolute(relative)
      ? Option.none()
      : Option.some(candidate);
  },
  toFileUrl,
  toNamespacedPath: NodePath.toNamespacedPath,
};

export const PathLive: Layer.Layer<Path.Path> = Layer.succeed(Path.Path)(PathService);
