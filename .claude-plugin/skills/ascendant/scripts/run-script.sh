#!/usr/bin/env bash
# Run an agent-written Effect script against the Ascendant API.
# Usage: run-script.sh <script.ts>
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/runtime.sh"

SCRIPT="${1:-}"
if [ -z "${SCRIPT}" ] || [ ! -f "${SCRIPT}" ]; then
  print_error \
    "Script file not found: ${SCRIPT}" \
    "VALIDATION_ERROR" \
    "Pass the path of a .ts file, for example ./.ascendant/scripts/transits.ts"
  exit 2
fi

exec bun "${SCRIPT}"
