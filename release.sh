#!/bin/bash

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# MELO RELEASE WORKFLOW - v1.6.3
# Production-safe, zero-manual-intervention release script
# ═══════════════════════════════════════════════════════════════════════════

# CONFIG
TARGET_VERSION="1.6.3"
RELEASE_TAG="v${TARGET_VERSION}"
GIT_BRANCH="main"
RELEASE_MESSAGE="release: v${TARGET_VERSION} - stability, DRM fixes, session persistence, UI improvements"
RELEASE_NOTES="Major release with DRM fixes, session persistence and UI improvements"

# ELECTRON CONFIG
# Local release uses standard Electron from package.json.
unset ELECTRON_MIRROR ELECTRON_CUSTOM_DIR ELECTRON_CUSTOM_VERSION 2>/dev/null || true

# COLORS
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# LOGGING
log() { echo -e "${BLUE}[INFO]${NC} $1"; }
ok() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# HEADER
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║         Melo Release Workflow v${TARGET_VERSION}                            ║"
echo "║         Production-safe, automated release process                   ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# 1. PRECHECKS - Environment & Dependencies
# ═══════════════════════════════════════════════════════════════════════════
log "1/9: Environment prechecks..."

command -v git >/dev/null || err "git command not found"
command -v npm >/dev/null || err "npm command not found"
[[ -f package.json ]] || err "package.json not found"
[[ -f package-lock.json ]] || err "package-lock.json missing (required for CI stability)"

ok "Environment verified"

# ═══════════════════════════════════════════════════════════════════════════
# 2. GIT SAFETY - Branch & Sync
# ═══════════════════════════════════════════════════════════════════════════
log "2/9: Git safety checks..."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$CURRENT_BRANCH" == "$GIT_BRANCH" ]] || err "Not on $GIT_BRANCH (current: $CURRENT_BRANCH)"

# Check if tag already exists
if git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
  err "Release tag $RELEASE_TAG already exists"
fi

# Sync any uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  warn "Working directory not clean - auto-syncing changes"
  git add .
  
  if ! git diff --cached --quiet; then
    git commit -m "chore: pre-release sync" || warn "Pre-release sync commit failed (might be already staged)"
  else
    warn "No new changes to commit"
  fi
fi

ok "Git synchronized"

# ═══════════════════════════════════════════════════════════════════════════
# 3. DEPENDENCY SAFETY - Electron & castLabs Config
# ═══════════════════════════════════════════════════════════════════════════
log "3/9: Dependency safety checks..."

# Verify Electron is NOT a GitHub dependency
ELECTRON_DEP=$(grep -o '"electron"[^}]*' package.json | head -1)
if echo "$ELECTRON_DEP" | grep -q "github:"; then
  err "Electron has GitHub dependency (breaks npm install). Use standard version."
fi

# Verify Electron version is standard
ELECTRON_VERSION=$(node -e "console.log(require('./package.json').devDependencies.electron)" 2>/dev/null || echo "")
if [[ -z "$ELECTRON_VERSION" ]] || [[ "$ELECTRON_VERSION" == *"github"* ]]; then
  err "Electron version not properly set: $ELECTRON_VERSION"
fi

log "  Electron version: $ELECTRON_VERSION"

# Verify castLabs mirror in build config
if ! grep -q '"mirror".*castlabs' package.json; then
  warn "castLabs mirror not configured in package.json build.electronDownload"
fi

ok "Dependencies validated"

# ═══════════════════════════════════════════════════════════════════════════
# 4. VERSION UPDATE
# ═══════════════════════════════════════════════════════════════════════════
log "4/9: Updating version to $TARGET_VERSION..."

npm version "$TARGET_VERSION" --no-git-tag-version --allow-same-version >/dev/null 2>&1 || \
  err "Failed to update version to $TARGET_VERSION"

ok "Version updated to $TARGET_VERSION"

# ═══════════════════════════════════════════════════════════════════════════
# 5. CLEAN BUILD - Safe cleanup (DO NOT delete package-lock.json)
# ═══════════════════════════════════════════════════════════════════════════
log "5/9: Cleaning build artifacts..."

# Only remove build outputs, NEVER package-lock.json
rm -rf node_modules dist dist-electron .vite .turbo 2>/dev/null || true

# Clear caches (safe)
npm cache clean --force >/dev/null 2>&1 || true
rm -rf ~/.cache/electron ~/.cache/electron-builder 2>/dev/null || true

# Verify package-lock.json still exists
[[ -f package-lock.json ]] || err "package-lock.json was deleted! Aborting."

ok "Build artifacts cleaned (package-lock.json preserved)"

# ═══════════════════════════════════════════════════════════════════════════
# 6. INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════
log "6/9: Installing dependencies with castLabs mirror config..."

# Use npm install (not npm ci) to allow flexibility, but respect lock file
if ! npm install; then
  err "npm install failed - check network and castLabs mirror availability"
fi

# Verify Electron binary was installed
if [[ ! -d node_modules/electron ]]; then
  err "Electron installation failed - binaries not found"
fi

ok "Dependencies installed (Electron: $ELECTRON_VERSION)"

# ═══════════════════════════════════════════════════════════════════════════
# 7. BUILD
# ═══════════════════════════════════════════════════════════════════════════
log "7/9: Building application..."

if ! npm run build; then
  err "Build failed - fix errors and retry"
fi

# Verify build output exists
[[ -d dist/renderer ]] || err "Build failed: dist/renderer not created"
[[ -d dist-electron ]] || err "Build failed: dist-electron not created"

# Check for release artifacts
ARTIFACTS_COUNT=$(find dist-electron -type f \( -name "*.AppImage" -o -name "*.deb" \) 2>/dev/null | wc -l)
if [[ $ARTIFACTS_COUNT -eq 0 ]]; then
  warn "No release artifacts found (AppImage/deb) - check electron-builder config"
fi

ok "Build successful ($ARTIFACTS_COUNT release artifacts)"

# ═══════════════════════════════════════════════════════════════════════════
# 8. GIT RELEASE FLOW - Commit, Tag, Push
# ═══════════════════════════════════════════════════════════════════════════
log "8/9: Creating release commit and tag..."

# Stage all changes (including updated package.json version)
git add package.json package-lock.json dist-electron/

# Commit release changes (allow empty commit if nothing new)
git commit -m "$RELEASE_MESSAGE" || warn "Release commit already up-to-date or failed"

# Create annotated tag
git tag -a "$RELEASE_TAG" -m "Release $TARGET_VERSION" || err "Failed to create git tag"

ok "Commit and tag created: $RELEASE_TAG"

# Push to remote
log "Pushing to remote..."
git push origin "$GIT_BRANCH" || err "Failed to push branch"
git push origin "$RELEASE_TAG" || err "Failed to push tag"

ok "Pushed to remote (branch + tag)"

# ═══════════════════════════════════════════════════════════════════════════
# 9. GITHUB RELEASE - Create release (optional, non-fatal)
# ═══════════════════════════════════════════════════════════════════════════
log "9/9: Creating GitHub release..."

if command -v gh >/dev/null 2>&1; then
  APPIMAGE=$(ls dist-electron/*.AppImage 2>/dev/null | head -1 || true)
  DEB=$(ls dist-electron/*.deb 2>/dev/null | head -1 || true)
  
  if [[ -n "$APPIMAGE" ]] && [[ -n "$DEB" ]]; then
    # Create release with artifacts
    if gh release create "$RELEASE_TAG" \
      --title "Melo $TARGET_VERSION" \
      --notes "$RELEASE_NOTES" \
      "$APPIMAGE" "$DEB" >/dev/null 2>&1; then
      ok "GitHub release created with artifacts"
    else
      warn "GitHub release creation skipped (may already exist)"
    fi
  else
    warn "Skipping GitHub release (artifacts missing): AppImage=$APPIMAGE, DEB=$DEB"
  fi
else
  warn "gh CLI not available - skipping GitHub release creation"
fi

# ═══════════════════════════════════════════════════════════════════════════
# SUCCESS
# ═══════════════════════════════════════════════════════════════════════════
echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                    🚀 RELEASE v$TARGET_VERSION COMPLETE 🚀                    ║"
echo "╠═══════════════════════════════════════════════════════════════════════╣"
echo "║  Tag:        $RELEASE_TAG"
echo "║  Branch:     $GIT_BRANCH"
echo "║  Electron:   $ELECTRON_VERSION (castLabs mirror enabled)"
echo "║  Status:     ✓ Ready for CI build and deployment"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""