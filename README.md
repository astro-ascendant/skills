# Skills

[![skills.sh](https://skills.sh/b/astro-ascendant/skills)](https://skills.sh/astro-ascendant/skills)

Save a birth chart once. Get consistent, evidence-backed readings every time.

No re-typing birth data. No made-up charts. Same input → same result.

## Why you'll love it

- **One record, endless questions**: career, timing, relationships, transits
- **KP by default, Parashari on request**: no mixed methods
- **Remembers what matters**: confirmed events build over time
- **Works where you work**: OpenCode, Claude, Codex, Cursor, Copilot, ChatGPT and more

## How it works

1. `add`: save birth data to generate Vedic and KP charts, dashas, Ashtakavarga
2. Ask anything: answers cite your stored chart, not vibes
3. `setup`: only when needed to install calculation deps

Just describe your birth details or ask a life question. It picks the right mode.

## Install in 30 seconds

**One command (any tool)**
```console
npx ascendant-skills install
```

Detects Claude Code, Codex, OpenCode, Cursor, Gemini CLI, Copilot, Kiro, Pi, Grok, Antigravity and
Windsurf, asks project or global, then installs the plugin where the tool has one and the skill
everywhere else. Scripted: `--providers=claude,cursor --scope=global --yes`.

Or install per tool:

**OpenCode (recommended)**
```console
opencode plugin add opencode-ascendant
```

> ⚠️ Requires OpenCode v2

**Claude Code**
```text
/plugin marketplace add astro-ascendant/skills
/plugin install ascendant@ascendant
```

**Codex**
```console
codex plugin marketplace add astro-ascendant/skills --ref main
codex plugin add ascendant@ascendant
```

**Agent Skills**
```console
npx skills add astro-ascendant/skills --skill ascendant
```

## For contributors

```bash
make build   # install, match versions, rebuild skills + opencode package, verify
```

Releases publish to npm and open a GitHub Release on tag push; see
[RELEASE.md](./RELEASE.md) and the
[Releases page](https://github.com/astro-ascendant/skills/releases).
