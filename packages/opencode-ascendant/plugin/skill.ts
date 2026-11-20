import type { Plugin } from "@opencode/plugin/effect";
import { AbsolutePath } from "@opencode/schema/schema";
import { Skill } from "@opencode/schema/skill";
import { Effect, FileSystem, Option, Path, pipe } from "effect";

export const registerSkill = Effect.fn("Ascendant.registerSkill")(function* (ctx: Plugin.Context) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skillFile = yield* path.fromFileUrl(
    new URL("../skills/ascendant/SKILL.md", import.meta.url),
  );
  const skillContent = yield* fs.readFileString(skillFile);
  const skillDescription = pipe(
    Option.fromNullishOr(skillContent.match(/^description: (.+)$/m)),
    Option.flatMap((match) => Option.fromUndefinedOr(match[1])),
    Option.map((description) => description.trim()),
    Option.getOrElse(() => "Vedic astrology skill for birth charts and transits"),
  );

  yield* ctx.skill.transform((editor) => {
    editor.add(
      Skill.Info.make({
        id: Skill.ID.make("ascendant"),
        name: Skill.Name.make("ascendant"),
        description: skillDescription,
        path: AbsolutePath.make(skillFile),
        content: skillContent,
      }),
    );
  });

  return skillDescription;
});
