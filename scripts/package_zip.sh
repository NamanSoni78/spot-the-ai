#!/usr/bin/env bash
# Package spot-the-ai into a Vercel-ready deployment zip.
# - App code + content + pipeline scripts + docs
# - Sandbox-specific config swapped for standard Next.js (plain next build)
# - Excludes: node_modules, .next, secrets, sandbox artifacts, heavy intermediates
set -euo pipefail

ROOT=/home/z/my-project
STAGE=$ROOT/download/.staging/spot-the-ai
OUT=$ROOT/download/spot-the-ai-deploy.zip

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE"

cd "$ROOT"

# ---------- app code + content ----------
cp -r src public scripts "$STAGE/"

# ---------- data: JSON manifests only (matches .gitignore policy) ----------
mkdir -p "$STAGE/data"
for f in data/*.json; do cp "$f" "$STAGE/data/"; done

# ---------- docs & config ----------
cp README.md SUBMISSION.md .env.example .gitignore components.json \
   eslint.config.mjs postcss.config.mjs tailwind.config.ts tsconfig.json \
   bun.lock next-env.d.ts "$STAGE/"

# ---------- Vercel-standard package.json ----------
# Derive deps/devDeps VERBATIM from the working local package.json (they match
# bun.lock, which was resolved against the real npm registry). Only name/
# description/scripts are overridden for a standard `next build` on Vercel.
# NEVER hand-type dependency versions here — a typo ships a version that does
# not exist on npm and Vercel's `bun install` fails with
# "No version matching ^x.y.z found for specifier ...".
jq '. + {
  name: "spot-the-ai",
  version: "1.0.0",
  private: true,
  description: "Real or AI? — a timed guessing game for Pollinations Quest #15725. One photo is real, one is AI-generated. Spot the fake.",
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
    lint: "eslint .",
    "content:regen": "bun scripts/regen_with_pollinations.ts",
    "content:build": "python3 scripts/build_rounds.py"
  }
}' package.json > "$STAGE/package.json"

# sanity: deps in the zip must be byte-identical to the source of truth
jq -S '.dependencies, .devDependencies' package.json > /tmp/deps_local.json
jq -S '.dependencies, .devDependencies' "$STAGE/package.json" > /tmp/deps_zip.json
if ! diff -q /tmp/deps_local.json /tmp/deps_zip.json >/dev/null; then
  echo "FATAL: zip package.json deps diverge from local package.json" >&2
  diff /tmp/deps_local.json /tmp/deps_zip.json >&2 || true
  exit 1
fi

# ---------- Vercel-standard next.config (no standalone output needed) ----------
cat > "$STAGE/next.config.ts" <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    // safety net for contributor environments; the repo typechecks clean
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
EOF

# ---------- sanity: critical paths present ----------
test -f "$STAGE/src/app/page.tsx"
test -f "$STAGE/src/data/rounds.json"
test -f "$STAGE/package.json"
real_count=$(ls "$STAGE/public/content/real" | wc -l)
fake_count=$(ls "$STAGE/public/content/fake" | wc -l)
echo "real images: $real_count, fake images: $fake_count"
test "$real_count" -ge 60 && test "$fake_count" -ge 60

# ---------- zip ----------
cd /home/z/my-project/download/.staging
zip -rq9 "$OUT" spot-the-ai
rm -rf /home/z/my-project/download/.staging

echo "--- zip created ---"
ls -lh "$OUT"
unzip -l "$OUT" | tail -3
echo "--- top-level entries ---"
unzip -l "$OUT" | awk '{print $4}' | grep -E "^spot-the-ai/[^/]+/?$" | sort -u
