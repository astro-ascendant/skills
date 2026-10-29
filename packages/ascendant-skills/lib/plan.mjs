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

const PROVIDER_IDS = PROVIDERS.map((p) => p.id);
const SCOPES = ["project", "global"];

/**
 * Parse argv (without node and script). Accepts `--flag=value` and
 * `--flag value`. Throws on unknown flags, providers or scopes so a typo in
 * a scripted install fails loudly instead of installing nothing.
 */
export function parseArgs(argv) {
  const opts = {
    command: undefined,
    providers: undefined,
    scope: undefined,
    yes: false,
    dryRun: false,
    help: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    const [flag, inline] = arg.startsWith("--") ? splitFlag(arg) : [arg, undefined];
    const value = () => inline ?? args.shift();
    switch (flag) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-y":
      case "--yes":
        opts.yes = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--providers":
        opts.providers = parseProviders(value());
        break;
      case "--scope":
        opts.scope = parseScope(value());
        break;
      default:
        if (flag.startsWith("-")) throw new Error(`Unknown option: ${flag}`);
        if (opts.command !== undefined) throw new Error(`Unexpected argument: ${flag}`);
        opts.command = flag;
    }
  }
  return opts;
}

function splitFlag(arg) {
  const eq = arg.indexOf("=");
  return eq === -1 ? [arg, undefined] : [arg.slice(0, eq), arg.slice(eq + 1)];
}

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

export function parseScope(raw) {
  const scope = raw?.trim().toLowerCase();
  if (!SCOPES.includes(scope)) throw new Error(`--scope must be one of: ${SCOPES.join(", ")}`);
  return scope;
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
 * Build the install plan.
 *
 * @param {object} input
 * @param {string[]} input.providers provider ids to install for
 * @param {"project"|"global"} input.scope
 * @param {(name: string) => boolean} input.hasBin whether a CLI is on PATH
 * @param {number | undefined} input.opencodeMajor OpenCode major version, if known
 * @returns {{ steps: Array<{ label: string, command: string, args: string[] }>, notes: string[] }}
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
      steps.push({
        label: "OpenCode: install plugin",
        command: "opencode",
        args: ["plugin", "add", OPENCODE_PACKAGE, ...(scope === "global" ? ["-g"] : [])],
      });
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
    steps.push({
      label: `Agent Skills: ${skillAgents.join(", ")}`,
      command: "npx",
      args: [
        "-y",
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
