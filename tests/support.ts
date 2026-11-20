import { Swisseph } from "astro-ascendant";
import { Effect, FileSystem, Layer, Schema } from "effect";

import { addPersonFromInput } from "../skills/ascendant/tools/add-person.ts";
import {
  AppLayer,
  KpAstroParamsLayer,
  Latitude,
  Longitude,
  OffsetMoment,
  PersonName,
  PlatformLayer,
  Workspace,
} from "../skills/ascendant/tools/common.ts";

export const KpLayer = Layer.mergeAll(PlatformLayer, KpAstroParamsLayer, Swisseph.SwissephLayer);

export const ADA = {
  name: Schema.decodeUnknownSync(PersonName)("Ada"),
  moment: Schema.decodeUnknownSync(OffsetMoment)("1990-01-01T12:00:00+05:30"),
  latitude: Schema.decodeUnknownSync(Latitude)(12.9716),
  longitude: Schema.decodeUnknownSync(Longitude)(77.5946),
} as const;

export const addAda = addPersonFromInput(ADA.name, ADA.moment, ADA.latitude, ADA.longitude).pipe(
  Effect.provide(AppLayer),
);

export const addPersonNamed = (name: string) =>
  addPersonFromInput(
    Schema.decodeUnknownSync(PersonName)(name),
    ADA.moment,
    ADA.latitude,
    ADA.longitude,
  ).pipe(Effect.provide(AppLayer));

export const inTempWorkspace = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "ascendant-test-" });
    return yield* Effect.provideService(effect, Workspace, directory);
  }).pipe(Effect.provide(PlatformLayer));
