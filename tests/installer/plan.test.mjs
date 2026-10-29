import { describe, expect, test } from "bun:test";
import {
  detectProviders,
  parseArgs,
  planInstall,
} from "../../packages/ascendant-skills/lib/plan.mjs";

const bins =
  (...names) =>
  (name) =>
    names.includes(name);

describe("parseArgs", () => {
  test("accepts inline and spaced flag values", () => {
    expect(parseArgs(["install", "--providers=claude,cursor", "--scope", "project", "-y"])).toEqual(
      {
        command: "install",
        providers: ["claude", "cursor"],
        scope: "project",
        yes: true,
        dryRun: false,
        help: false,
      },
    );
  });

  test("expands all and rejects unknown providers, scopes and flags", () => {
    expect(parseArgs(["install", "--providers=all"]).providers).toContain("windsurf");
    expect(() => parseArgs(["install", "--providers=claud"])).toThrow("Unknown provider");
    expect(() => parseArgs(["install", "--scope=local"])).toThrow("--scope");
    expect(() => parseArgs(["install", "--force"])).toThrow("Unknown option");
  });
});

describe("detectProviders", () => {
  test("matches on a binary or a home directory", () => {
    const detected = detectProviders({
      hasBin: bins("claude"),
      hasHomeDir: (dir) => dir === ".cursor",
    });
    expect(detected).toEqual(["claude", "cursor"]);
  });
});

describe("planInstall", () => {
  test("uses native plugins when the CLIs exist and batches the rest into one skills call", () => {
    const { steps, notes } = planInstall({
      providers: ["claude", "codex", "opencode", "cursor", "gemini"],
      scope: "global",
      hasBin: bins("claude", "codex", "opencode"),
      opencodeMajor: 2,
    });
    expect(steps.map((s) => [s.command, ...s.args].join(" "))).toEqual([
      "claude plugin marketplace add astro-ascendant/skills --scope user",
      "claude plugin install ascendant@ascendant --scope user",
      "codex plugin marketplace add astro-ascendant/skills --ref main",
      "codex plugin add ascendant@ascendant",
      "opencode plugin add opencode-ascendant -g",
      "npx -y skills add astro-ascendant/skills --skill ascendant --agent cursor gemini-cli --global --yes",
    ]);
    expect(notes).toEqual([]);
  });

  test("falls back to the skill when a plugin CLI is missing or OpenCode is v1", () => {
    const { steps, notes } = planInstall({
      providers: ["claude", "opencode"],
      scope: "project",
      hasBin: bins("opencode"),
      opencodeMajor: 1,
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].args).toEqual([
      "-y",
      "skills",
      "add",
      "astro-ascendant/skills",
      "--skill",
      "ascendant",
      "--agent",
      "claude-code",
      "opencode",
      "--yes",
    ]);
    expect(notes[0]).toContain("OpenCode v2");
  });

  test("project scope maps to Claude project scope and notes Codex is per-user", () => {
    const { steps, notes } = planInstall({
      providers: ["claude", "codex"],
      scope: "project",
      hasBin: bins("claude", "codex"),
      opencodeMajor: undefined,
    });
    expect(steps[0].args.at(-1)).toBe("project");
    expect(notes).toEqual(["Codex plugins are per-user; the Codex plugin installs globally."]);
  });
});
