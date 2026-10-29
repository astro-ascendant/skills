import { describe, expect, test } from "bun:test";
import {
  detectProviders,
  parseProviders,
  planInstall,
} from "../../packages/ascendant-skills/lib/plan.mjs";

const bins =
  (...names) =>
  (name) =>
    names.includes(name);

describe("parseProviders", () => {
  test("splits, trims and dedupes ids, and expands all", () => {
    expect(parseProviders(" Claude, cursor,claude ")).toEqual(["claude", "cursor"]);
    expect(parseProviders("all")).toContain("windsurf");
  });

  test("rejects an empty value and unknown providers", () => {
    expect(() => parseProviders("")).toThrow("--providers needs a value");
    expect(() => parseProviders("claud")).toThrow("Unknown provider");
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
      hasBin: bins("claude", "codex", "opencode", "npx"),
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
    // No npx on PATH: hand off to bunx instead.
    expect(steps[0].command).toBe("bunx");
    expect(steps[0].args).toEqual([
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
