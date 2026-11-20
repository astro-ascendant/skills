# Releasing opencode-ascendant

The npm package `opencode-ascendant` is generated from repo sources by
`scripts/build-opencode-plugin.mjs` (plugin modules from
`.opencode/plugins/ascendant/`, skill tree from `skills/ascendant/`, version
and dependency pins stamped from `package.json` / `.opencode/package.json`).
Never hand-edit `packages/opencode-ascendant/plugin/` or
`packages/opencode-ascendant/skills/` (build output).

Source of truth for the release version is the root `package.json`;
`scripts/sync-versions.mjs` stamps it into every manifest and rebuilds.

## One-time setup (done)

Publishing runs in CI via npm OIDC trusted publishing, so no `NPM_TOKEN`
secret, no one-time passwords. The trusted publisher (repo
`astro-ascendant/skills`, workflow `release-opencode.yml`) is configured
on npmjs.com and already validated. Nothing to do here for future releases.
If the repository is renamed or transferred again, update the trusted
publisher's repository on npmjs.com to match before the next release.

## Release steps

1. Add a changeset `.changeset/<name>.md`:
   ```md
   ---
   "opencode-ascendant": patch
   ---

   What changed.
   ```
   Use `minor` for features, `patch` for fixes.
2. Consume it and restamp:
   ```bash
   make version
   ```
3. Set `version` in the root `package.json` to the new version, then verify:
   ```bash
   make build
   ```
   This restamps every manifest, rebuilds all generated copies, and runs
   typecheck, tests, lint, and format checks.
4. The agent commits and pushes to `main`.
5. The agent creates and pushes the tag (confirm first, since pushing the
   tag publishes to npm):
   ```bash
   git tag opencode-ascendant-vX.Y.Z
   git push origin opencode-ascendant-vX.Y.Z
   ```
   The tag must match `packages/opencode-ascendant/package.json`;
   CI enforces this.
   Pushing the tag runs `.github/workflows/release-opencode.yml`, which
   rebuilds the package, runs
   `npm publish --provenance --access public`, then creates a GitHub
   Release for the tag with generated notes. Both artifacts come from the
   one tag push, so there is nothing extra to do on GitHub.

## Local publish alternative

```bash
make publish
```

Versions from changesets, rebuilds, and publishes from your machine.
Needs npm auth with 2FA handled (automation token or `--otp`); prefer the
tag-push CI path above.
