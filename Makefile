.DEFAULT_GOAL := help
.PHONY: help build publish

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

build: ## Install deps, match versions, rebuild everything and verify
	bun install --frozen-lockfile
	(cd .opencode && bun install --frozen-lockfile)
	bun scripts/sync-versions.mjs
	bun run typecheck && bun run test && bun run lint && bun run format:check

version: ## Consume changesets into version bumps + changelogs, then restamp
	bunx changeset version
	bun scripts/sync-versions.mjs

publish: ## Version from changesets, rebuild all and publish opencode-ascendant
	bunx changeset version
	bun scripts/sync-versions.mjs
	cd packages/opencode-ascendant && bun install && npm publish --provenance --access public
