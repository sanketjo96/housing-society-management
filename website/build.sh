#!/usr/bin/env bash
# Assemble the published site: the landing page from website/ at the root and
# the clickable demo from demo/ at /demo/. Output goes to _site/ (or $1).
#
# The demo is published with db.seed.json as its db.json, so a local
# json-server session that changed db.json never leaks onto the public site.
#
#   ./website/build.sh            # builds _site/
#   npx serve _site               # preview it
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/_site}"

rm -rf "$out"
mkdir -p "$out/demo"

cp "$root/website/index.html" "$root/website/favicon.svg" "$root/website/preview.jpg" "$out/"

# Everything in demo/ is published except tooling and docs, so new modules,
# client presets and data files are picked up without editing this script.
tar -C "$root/demo" -cf - \
  --exclude='./node_modules' --exclude='./tests' --exclude='./package.json' \
  --exclude='./package-lock.json' --exclude='./README.md' --exclude='./API.md' \
  --exclude='./.gitignore' --exclude='./db.json' . | tar -C "$out/demo" -xf -
cp "$root/demo/db.seed.json" "$out/demo/db.json"

touch "$out/.nojekyll"
cat > "$out/README.md" <<'EOF'
# Saral Society — GitHub Pages

Built automatically from the `product` branch by
`.github/workflows/publish-site.yml` (`website/build.sh`). Don't edit this
branch by hand: change `website/` or `demo/` on `product` instead.

- `/` — marketing site (`website/`)
- `/demo/` — clickable demo (`demo/`)
EOF

echo "Site built in $out"
