/**
 * Pure planning for `npx ascendant-skills install`: which harnesses exist,
 * and which commands install the ascendant skill or plugin into each.
 *
 * Nothing here touches the filesystem or spawns processes; `bin/cli.mjs`
 * supplies the detection results and runs the plan. That keeps the
 * command matrix testable (tests/installer/plan.test.mjs).
 *
 * Harnesses with a native plugin (Claude Code, Codex, OpenCode v2) get the
 * plugin when their CLI is on PATH; everything else, and those three when
 * their CLI is missing, get the canonical skill through `npx skills add`.
 */

export const REPO = "astro-ascendant/skills";
export const SKILL = "ascendant";
export const MARKETPLACE_NAME = "ascendant";
export const MARKETPLACE_PLUGIN = "ascendant@ascendant";
export const OPENCODE_PACKAGE = "opencode-ascendant";

/**
 * `id` is what `--providers` accepts. `agent` is the `npx skills` agent id.
 * `bins` and `homeDirs` (relative to the home directory) mark the harness
 * as installed; any one match is enough.
 */
export const PROVIDERS = [
  {
    id: "claude",
    name: "Claude Code",
    agent: "claude-code",
    bins: ["claude"],
    homeDirs: [".claude"],
  },
  { id: "codex", name: "Codex", agent: "codex", bins: ["codex"], homeDirs: [".codex"] },
  {
    id: "opencode",
    name: "OpenCode",
    agent: "opencode",
    bins: ["opencode"],
    homeDirs: [".config/opencode"],
  },
  {
    id: "cursor",
    name: "Cursor",
    agent: "cursor",
    bins: ["cursor", "cursor-agent"],
    homeDirs: [".cursor"],
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    agent: "gemini-cli",
    bins: ["gemini"],
    homeDirs: [".gemini"],
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    agent: "github-copilot",
    bins: ["copilot"],
    homeDirs: [".copilot"],
  },
  { id: "kiro", name: "Kiro", agent: "kiro-cli", bins: ["kiro-cli"], homeDirs: [".kiro"] },
  { id: "pi", name: "Pi", agent: "pi", bins: ["pi"], homeDirs: [".pi"] },
  { id: "grok", name: "Grok Build", agent: "grok", bins: ["grok"], homeDirs: [".grok"] },
  {
    id: "antigravity",
    name: "Antigravity",
    agent: "antigravity",
    bins: ["antigravity"],
    homeDirs: [".gemini/antigravity"],
  },
  {
    id: "windsurf",
    name: "Windsurf",
    agent: "windsurf",
    bins: ["windsurf"],
    homeDirs: [".codeium/windsurf"],
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
export const SCOPES = ["project", "global"];

/**
 * Parse a comma-separated `--providers` value. Throws on an empty value or an
 * unknown id so a typo in a scripted install fails loudly instead of
 * installing nothing. `all` expands to every provider.
 */
export function parseProviders(raw) {
  if (!raw) throw new Error(`--providers needs a value: ${PROVIDER_IDS.join(",")} or all`);
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (ids.includes("all")) return [...PROVIDER_IDS];
  const unknown = ids.filter((id) => !PROVIDER_IDS.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown provider(s): ${unknown.join(", ")}. Known: ${PROVIDER_IDS.join(", ")}`,
    );
  }
  return [...new Set(ids)];
}

/**
 * Which providers are installed, given probes for binaries and home dirs.
 * `hasBin(name)` and `hasHomeDir(relPath)` are injected by the CLI.
 */
export function detectProviders({ hasBin, hasHomeDir }) {
  return PROVIDERS.filter((p) => p.bins.some(hasBin) || p.homeDirs.some(hasHomeDir)).map(
    (p) => p.id,
  );
}

/**
 * @typedef {{ label: string, command: string, args: string[] }} PlanStep
 * A step may also carry `recover`: extra steps that repair a known precondition
 * (a stale marketplace source, say) before the runner retries the step once.
 */

/**
 * Build the install plan.
 *
 * @param {object} input
 * @param {string[]} input.providers provider ids to install for
 * @param {"project"|"global"} input.scope
 * @param {(name: string) => boolean} input.hasBin whether a CLI is on PATH
 * @param {number | undefined} input.opencodeMajor OpenCode major version, if known
 * @returns {{ steps: PlanStep[], notes: string[] }}
 */
export function planInstall({ providers, scope, hasBin, opencodeMajor }) {
  const steps = [];
  const notes = [];
  const skillAgents = [];

  for (const id of providers) {
    const provider = PROVIDERS.find((p) => p.id === id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);

    if (id === "claude" && hasBin("claude")) {
      // Claude Code calls the global scope "user".
      const claudeScope = scope === "global" ? "user" : "project";
      steps.push(
        {
          label: "Claude Code: add marketplace",
          command: "claude",
          args: ["plugin", "marketplace", "add", REPO, "--scope", claudeScope],
        },
        {
          label: "Claude Code: install plugin",
          command: "claude",
          args: ["plugin", "install", MARKETPLACE_PLUGIN, "--scope", claudeScope],
        },
      );
    } else if (id === "codex" && hasBin("codex")) {
      steps.push(
        {
          label: "Codex: add marketplace",
          command: "codex",
          args: ["plugin", "marketplace", "add", REPO, "--ref", "main"],
          // Codex refuses to re-add a marketplace whose recorded source differs
          // (one added without --ref, or from a local checkout) and does not
          // upgrade it either, which would leave an old plugin in place. Drop
          // that source, then let the retry add ours.
          recover: [
            {
              label: "Codex: drop stale marketplace",
              command: "codex",
              args: ["plugin", "marketplace", "remove", MARKETPLACE_NAME],
            },
          ],
        },
        {
          label: "Codex: install plugin",
          command: "codex",
          args: ["plugin", "add", MARKETPLACE_PLUGIN],
        },
      );
      if (scope === "project")
        notes.push("Codex plugins are per-user; the Codex plugin installs globally.");
    } else if (id === "opencode" && hasBin("opencode") && (opencodeMajor ?? 0) >= 2) {
      // `opencode plugin add` always writes the global config and rejects every
      // scope flag, so the scope cannot be passed here.
      steps.push({
        label: "OpenCode: install plugin",
        command: "opencode",
        args: ["plugin", "add", OPENCODE_PACKAGE],
      });
      if (scope === "project")
        notes.push("OpenCode plugins are global; the OpenCode plugin installs globally.");
    } else {
      if (id === "opencode" && hasBin("opencode")) {
        notes.push(
          "The OpenCode plugin needs OpenCode v2; installing the skill only. Upgrade, then rerun.",
        );
      }
      skillAgents.push(provider.agent);
    }
  }

  if (skillAgents.length > 0) {
    // `npx ascendant-skills` implies npx, but `bunx ascendant-skills` works
    // too and Bun-only machines have no npx to hand off to.
    const [runner, ...runnerArgs] = hasBin("npx") ? ["npx", "-y"] : ["bunx"];
    steps.push({
      label: `Agent Skills: ${skillAgents.join(", ")}`,
      command: runner,
      args: [
        ...runnerArgs,
        "skills",
        "add",
        REPO,
        "--skill",
        SKILL,
        "--agent",
        ...skillAgents,
        ...(scope === "global" ? ["--global"] : []),
        "--yes",
      ],
    });
  }

  return { steps, notes };
}
