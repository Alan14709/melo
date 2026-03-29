#!/bin/bash

set -euo pipefail

# CONFIG
TARGET_VERSION="1.6.0"
RELEASE_TAG="v${TARGET_VERSION}"
GIT_BRANCH="main"
RELEASE_MESSAGE="release: v${TARGET_VERSION} - Major stability, DRM fixes, session persistence, UI improvements"

# COLORS
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "════════════════════════════════════"
echo "   Melo Release v${TARGET_VERSION}"
echo "════════════════════════════════════"

# PRECHECKS
log "Checking environment..."
command -v git >/dev/null || err "git missing"
command -v npm >/dev/null || err "npm missing"

[[ -n $(git status --porcelain) ]] && err "Git not clean"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]] && err "Wrong branch: $CURRENT_BRANCH"

if git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
  err "Tag already exists"
fi

ok "Pre-checks passed"

# CLEAN
log "Cleaning project..."
rm -rf node_modules dist dist-electron .vite .turbo

# 🔥 NO BORRAR LOCKFILE
log "Keeping package-lock.json for CI stability"

npm cache clean --force
rm -rf ~/.cache/electron ~/.cache/electron-builder

ok "Clean complete"

# INSTALL
log "Installing dependencies..."
npm install || err "npm install failed"
ok "Dependencies installed"

# BUILD
log "Building..."
npm run build || err "build failed"
ok "Build OK"

# VERSION
log "Setting version..."
npm version "$TARGET_VERSION" --no-git-tag-version --allow-same-version
ok "Version set"

# GIT COMMIT (SMART)
log "Committing..."

git add .

if git diff --cached --quiet; then
  log "No changes to commit (already up-to-date)"
else
  git commit -m "$RELEASE_MESSAGE" || err "commit failed"
  ok "Commit created"
fi

# TAG
log "Creating tag..."
git tag -a "$RELEASE_TAG" -m "Release $TARGET_VERSION"
ok "Tag created"

# PUSH
log "Pushing..."
git push origin "$GIT_BRANCH" || err "push failed"
git push origin "$RELEASE_TAG" || err "tag push failed"
ok "Push complete"

# RELEASE (opcional)
if command -v gh >/dev/null; then
  log "Creating GitHub release..."

  APPIMAGE=$(ls dist-electron/*.AppImage 2>/dev/null | head -1 || true)
  DEB=$(ls dist-electron/*.deb 2>/dev/null | head -1 || true)

  gh release create "$RELEASE_TAG" \
    --title "Melo $TARGET_VERSION" \
    --notes "Major release with DRM fixes, session persistence and stability improvements" \
    "$APPIMAGE" "$DEB" || log "Release already exists or failed (skip)"

  ok "GitHub release done"
fi

echo ""
echo "🚀 RELEASE 1.6.0 LISTA CABRÓN"
echo ""