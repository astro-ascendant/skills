#!/usr/bin/env bash
set -euo pipefail

# Dependencies belong to the current working directory. The installed skill
# may live elsewhere, so its directory is not the dependency location.
WORKING_DIRECTORY="$(pwd -P)"

required_packages=(
  "@effect/platform-bun"
  "@swisseph/node"
  "@toon-format/toon"
  "astro-ascendant"
  "effect"
)

package_specs=(
  "@effect/platform-bun@4.0.5"
  "@swisseph/node@1.4.0"
  "@toon-format/toon@4.4.0"
  "astro-ascendant@5.1.1"
  "effect@4.0.5"
)

cd "${WORKING_DIRECTORY}"
if command -v bun >/dev/null 2>&1; then
  install_dependencies() {
    bun add --no-save --trust "${package_specs[@]}"
  }
else
  printf 'error: Bun package manager is required\ncode: RUNTIME_MISSING\nhelp: Install Bun, then retry'
  exit 1
fi

if install_dependencies >&2; then
  for package in "${required_packages[@]}"; do
    if [ ! -f "${WORKING_DIRECTORY}/node_modules/${package}/package.json" ]; then
      printf 'error: Ascendant dependencies were not installed\ncode: SETUP_FAILED\nhelp: Run setup again after checking the package manager output'
      exit 1
    fi
  done
  printf 'setup:\n  status: installed\n  directory: %s\n' "${WORKING_DIRECTORY}"
else
  printf 'error: Dependency installation failed\ncode: SETUP_FAILED\nhelp: Run setup again after checking the package manager output'
  exit 1
fi
