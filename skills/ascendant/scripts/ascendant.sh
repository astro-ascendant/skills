#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/runtime.sh"
exec bun "${RUNTIME_TOOLS_DIR}/ascendant.ts" "$@"
