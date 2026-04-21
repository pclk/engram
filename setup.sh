#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CHROMIUM_PACKAGES=(
  libatk1.0-0
  libatk-bridge2.0-0
  libnss3
  libx11-xcb1
  libxcomposite1
  libxdamage1
  libxrandr2
  libgbm1
  libasound2
  libcups2
  libxshmfence1
  libdrm2
  libgtk-3-0
  libpango-1.0-0
  libpangocairo-1.0-0
)

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed. Install Node.js 20+ and rerun setup.sh."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is not installed. Install pnpm 10+ and rerun setup.sh."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ ! -f pnpm-lock.yaml ]; then
  echo "Error: Missing pnpm-lock.yaml. This repository uses pnpm."
  exit 1
fi

if [ -f package-lock.json ]; then
  echo "Error: Found package-lock.json. This repository uses pnpm with pnpm-lock.yaml."
  exit 1
fi

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Warning: Node.js $(node -v) detected. Node.js 20+ is recommended."
fi

if command -v apt-get >/dev/null 2>&1; then
  APT_CMD="apt-get"
  if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
    APT_CMD="sudo apt-get"
  fi

  echo "Installing Chromium runtime dependencies..."
  $APT_CMD update
  $APT_CMD install -y "${CHROMIUM_PACKAGES[@]}"
else
  echo "Skipping apt dependencies (apt-get not found)."
fi

echo "Installing Node dependencies..."
pnpm install --frozen-lockfile

if [ ! -f .env.local ]; then
  cat > .env.local <<'ENVEOF'
# Public Neon browser client config (used by src/lib/auth.ts)
NEXT_PUBLIC_NEON_AUTH_URL=
NEXT_PUBLIC_NEON_DATA_API_URL=

# Server Neon API config (used by src/server/api/neon.ts)
NEON_AUTH_URL=
NEON_DATA_API_URL=

# Prisma database config
DATABASE_URL=
DIRECT_URL=

# Optional model key for live Gemini calls
GEMINI_API_KEY=
ENVEOF
  echo "Created .env.local template. Fill in Neon/DB env vars (and GEMINI_API_KEY if needed) before pnpm run dev."
fi

if command -v ldd >/dev/null 2>&1; then
  echo "Verifying Playwright Chromium shared-library links..."
  CHROMIUM_BIN="$(node -e "const { chromium } = require('playwright'); console.log(chromium.executablePath());")"
  echo "Using Chromium binary: ${CHROMIUM_BIN}"
  ldd "${CHROMIUM_BIN}" >/dev/null
fi

echo "Setup complete."
echo "Next steps:"
echo "  1) Add GEMINI_API_KEY to .env.local (if you need live model calls)."
echo "  2) Run pnpm run dev (local development)."
echo "  3) Run pnpm run test:e2e (end-to-end tests)."
