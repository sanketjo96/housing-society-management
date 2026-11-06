#!/usr/bin/env bash
# Builds the published site into a temp folder and runs the demo checks
# against it: screen links, client presets, and saved data / json-server mode.
#
#   npm test                      # from demo/
#   bash tests/run.sh             # same
#
# Needs Playwright from e2e/ (cd e2e && npm ci) and json-server from demo/
# (cd demo && npm install). See tests/README.md.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
[ -d "$repo/e2e/node_modules/playwright" ] || { echo "Playwright missing: run (cd e2e && npm ci) first."; exit 1; }
[ -x "$repo/demo/node_modules/.bin/json-server" ] || { echo "json-server missing: run (cd demo && npm install) first."; exit 1; }

site="$(mktemp -d)"
trap 'rm -rf "$site"' EXIT
"$repo/website/build.sh" "$site" >/dev/null

fail=0
for t in routes presets persist; do
  echo "== $t"
  if node "$here/$t.mjs" "$site"; then :; else fail=1; fi
done
[ "$fail" = 0 ] && echo "All demo checks passed." || { echo "Some demo checks failed."; exit 1; }
