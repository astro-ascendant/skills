#!/usr/bin/env bash
# Sourced by ascendant.sh and run-script.sh. Checks Bun and the packages, then
# syncs the skill's tools into ./.ascendant-agent/tools so Bun resolves the
# packages installed in the current working directory. Sets WORKING_DIRECTORY,
# SKILL_DIR and RUNTIME_TOOLS_DIR; prints an error and exits when not ready.

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Keep dependencies, the runtime copy, and person records in the current
# working directory rather than beside the installed skill.
WORKING_DIRECTORY="$(pwd -P)"
RUNTIME_DIR="${WORKING_DIRECTORY}/.ascendant-agent"
RUNTIME_TOOLS_DIR="${RUNTIME_DIR}/tools"

print_error() {
  printf 'error: %s\ncode: %s\nhelp: %s' "$1" "$2" "$3"
}

if ! command -v bun >/dev/null 2>&1; then
  print_error \
    "Bun is required to run Ascendant" \
    "RUNTIME_MISSING" \
    "Install Bun, then retry"
  exit 1
fi

if [ ! -f "${WORKING_DIRECTORY}/node_modules/astro-ascendant/package.json" ] || \
  [ ! -f "${WORKING_DIRECTORY}/node_modules/effect/package.json" ]; then
  print_error \
    "Ascendant dependencies are missing" \
    "RUNTIME_MISSING" \
    "Run bash \"${SKILL_DIR}/scripts/setup.sh\" from ${WORKING_DIRECTORY}, then retry"
  exit 1
fi

mkdir -p "${RUNTIME_TOOLS_DIR}"
if [ ! -e "${RUNTIME_DIR}/.gitignore" ]; then
  printf '*\n' > "${RUNTIME_DIR}/.gitignore"
fi
# Local-only runtime copy: sync the trusted skill sources into the working
# directory so Bun resolves the CWD-installed node_modules. No remote
# fetch happens here. Explicit allowlist only; add new tool files here.
cp "${SKILL_DIR}/tools/api.ts" \
  "${SKILL_DIR}/tools/ascendant.ts" \
  "${SKILL_DIR}/tools/cli.ts" \
  "${SKILL_DIR}/tools/common.ts" \
  "${SKILL_DIR}/tools/contract.ts" \
  "${SKILL_DIR}/tools/errors.ts" \
  "${SKILL_DIR}/tools/tool-specs.ts" \
  "${SKILL_DIR}/tools/toolkit.ts" \
  "${SKILL_DIR}/tools/workflows.ts" \
  "${SKILL_DIR}/tools/check-transit.ts" \
  "${SKILL_DIR}/tools/ruling-planets.ts" \
  "${SKILL_DIR}/tools/add-person.ts" \
  "${SKILL_DIR}/tools/kp-lords.ts" \
  "${SKILL_DIR}/tools/markdown.ts" \
  "${SKILL_DIR}/tools/path.ts" \
  "${SKILL_DIR}/tools/version.ts" \
  "${SKILL_DIR}/tools/package.json" \
  "${RUNTIME_TOOLS_DIR}/"

cd "${WORKING_DIRECTORY}"
