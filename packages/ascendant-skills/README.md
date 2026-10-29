# ascendant-skills

Installs the [Ascendant](https://github.com/astro-ascendant/skills) Vedic astrology skill and plugins with one command.

```console
npx ascendant-skills install
```

It detects your coding tools, asks whether to install for this project or globally, then:

| Tool | What gets installed |
| --- | --- |
| Claude Code | `ascendant` plugin from the `astro-ascendant/skills` marketplace |
| Codex | `ascendant` plugin from the `astro-ascendant/skills` marketplace (always per-user) |
| OpenCode v2 | `opencode-ascendant` plugin |
| Cursor, Gemini CLI, GitHub Copilot, Kiro, Pi, Grok Build, Antigravity, Windsurf | `ascendant` skill via `npx skills add` |

A tool whose CLI is not on PATH (or OpenCode v1) gets the skill instead of the plugin.

## Scripted installs

```console
npx ascendant-skills install --providers=claude,codex,cursor --scope=global --yes
```

- `--providers`: comma-separated ids (`claude`, `codex`, `opencode`, `cursor`, `gemini`, `copilot`, `kiro`, `pi`, `grok`, `antigravity`, `windsurf`) or `all`. Defaults to the detected tools.
- `--scope`: `project` or `global`. Defaults to `global` with `--yes`.
- `--dry-run`: print the commands without running them.

Rerun the same command to refresh an existing install.
