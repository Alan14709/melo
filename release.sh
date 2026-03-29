#!/bin/bash

################################################################################
# Melo Release Script - v1.5.4
# DevOps-grade automation for clean, safe, production-ready releases
# Date: 2026-03-29
#
# Purpose: Automate complete release workflow with maximum stability
# - Clean build environment
# - Install dependencies safely
# - Build with validation
# - Version management
# - Git operations (commit, tag, push)
# - Optional GitHub release creation
#
# Failure mode: FAIL-FAST on any error
# Safety: All operations validated before proceeding
################################################################################

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
TARGET_VERSION="1.5.4"
RELEASE_TAG="v${TARGET_VERSION}"
GIT_BRANCH="main"
RELEASE_MESSAGE="release: v${TARGET_VERSION} - Production-ready release with DRM, session persistence, and stability improvements"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
STEPS_COMPLETED=0
TOTAL_STEPS=12

# ============================================================================
# LOGGING FUNCTIONS
# ============================================================================

log_step() {
  ((STEPS_COMPLETED++))
  echo -e "${BLUE}[STEP ${STEPS_COMPLETED}/${TOTAL_STEPS}]${NC} $1"
}

log_ok() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_separator() {
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

check_command_exists() {
  if ! command -v "$1" &> /dev/null; then
    log_error "Required command not found: $1"
    return 1
  fi
  return 0
}

check_git_clean() {
  if [[ -n $(git status --porcelain) ]]; then
    log_error "Git working directory is not clean. Commit or stash changes first."
    git status --short
    return 1
  fi
  log_ok "Git working directory is clean"
}

check_git_branch() {
  local current_branch
  current_branch=$(git rev-parse --abbrev-ref HEAD)
  if [[ "$current_branch" != "$GIT_BRANCH" ]]; then
    log_error "Not on ${GIT_BRANCH} branch. Current: ${current_branch}"
    return 1
  fi
  log_ok "On correct branch: ${GIT_BRANCH}"
}

check_tag_exists() {
  if git rev-parse "${RELEASE_TAG}" &>/dev/null; then
    log_error "Tag ${RELEASE_TAG} already exists"
    return 1
  fi
  log_ok "Tag ${RELEASE_TAG} does not exist"
}

check_build_artifacts() {
  local appimage_found=0
  local deb_found=0
  
  # Check for AppImage
  if ls dist-electron/*.AppImage 1> /dev/null 2>&1; then
    appimage_found=1
    log_ok "AppImage artifact found: $(ls dist-electron/*.AppImage | head -1)"
  else
    log_error "No AppImage artifact found in dist-electron/"
    return 1
  fi
  
  # Check for .deb
  if ls dist-electron/*.deb 1> /dev/null 2>&1; then
    deb_found=1
    log_ok ".deb artifact found: $(ls dist-electron/*.deb | head -1)"
  else
    log_warn ".deb artifact not found (optional)"
  fi
  
  # Verify that renderer dist exists
  if [[ ! -d "dist/renderer" ]]; then
    log_error "Renderer dist directory not found"
    return 1
  fi
  log_ok "Renderer dist directory verified"
}

# ============================================================================
# CLEANUP FUNCTIONS
# ============================================================================

cleanup_build_cache() {
  log_step "Cleaning build artifacts and cache"
  
  # Remove local directories
  local dirs_to_remove=(
    "node_modules"
    "dist"
    "dist-electron"
    ".vite"
    ".turbo"
  )
  
  for dir in "${dirs_to_remove[@]}"; do
    if [[ -d "$dir" ]]; then
      log_info "Removing: $dir"
      rm -rf "$dir"
    fi
  done
  
  # Remove lock files
  if [[ -f "package-lock.json" ]]; then
    log_info "Removing: package-lock.json"
    rm -f "package-lock.json"
  fi
  
  log_ok "Build artifacts cleaned"
}

cleanup_npm_cache() {
  log_step "Cleaning npm cache"
  
  npm cache clean --force
  log_ok "npm cache cleaned"
}

cleanup_electron_cache() {
  log_step "Cleaning Electron cache"
  
  # Remove global electron cache
  if [[ -d "$HOME/.cache/electron" ]]; then
    log_info "Removing: ~/.cache/electron"
    rm -rf "$HOME/.cache/electron"
  fi
  
  # Remove electron-builder cache
  if [[ -d "$HOME/.cache/electron-builder" ]]; then
    log_info "Removing: ~/.cache/electron-builder"
    rm -rf "$HOME/.cache/electron-builder"
  fi
  
  log_ok "Electron cache cleaned"
}

# ============================================================================
# INSTALLATION FUNCTIONS
# ============================================================================

install_dependencies() {
  log_step "Installing npm dependencies"
  
  if ! npm install; then
    log_error "npm install failed"
    return 1
  fi
  
  log_ok "Dependencies installed successfully"
}

# ============================================================================
# BUILD FUNCTIONS
# ============================================================================

build_project() {
  log_step "Building project (Vite + Electron Builder)"
  
  if ! npm run build; then
    log_error "Build failed"
    return 1
  fi
  
  log_ok "Build completed successfully"
}

verify_build_artifacts() {
  log_step "Verifying build artifacts"
  
  if ! check_build_artifacts; then
    log_error "Build artifacts verification failed"
    return 1
  fi
  
  log_ok "Build artifacts verified"
}

# ============================================================================
# VERSION MANAGEMENT
# ============================================================================

update_version() {
  log_step "Updating version to ${TARGET_VERSION}"
  
  # Check if npm is available
  if ! check_command_exists npm; then
    log_error "npm command not found"
    return 1
  fi
  
  # Update package.json version
  npm version "${TARGET_VERSION}" --no-git-tag-version --force
  
  if grep -q "\"version\": \"${TARGET_VERSION}\"" package.json; then
    log_ok "Version updated in package.json to ${TARGET_VERSION}"
  else
    log_error "Version update verification failed"
    return 1
  fi
}

# ============================================================================
# GIT OPERATIONS
# ============================================================================

git_commit_version() {
  log_step "Creating git commit"
  
  # Stage version change
  git add package.json
  
  # Create commit
  if ! git commit -m "${RELEASE_MESSAGE}"; then
    log_error "Git commit failed"
    return 1
  fi
  
  log_ok "Commit created: ${RELEASE_MESSAGE}"
}

git_create_tag() {
  log_step "Creating git tag"
  
  if ! git tag -a "${RELEASE_TAG}" -m "Release ${TARGET_VERSION}"; then
    log_error "Git tag creation failed"
    return 1
  fi
  
  log_ok "Tag created: ${RELEASE_TAG}"
}

git_push_main() {
  log_step "Pushing to ${GIT_BRANCH}"
  
  if ! git push origin "${GIT_BRANCH}"; then
    log_error "Push to ${GIT_BRANCH} failed"
    return 1
  fi
  
  log_ok "Pushed to ${GIT_BRANCH}"
}

git_push_tags() {
  log_step "Pushing tags"
  
  if ! git push origin "${RELEASE_TAG}"; then
    log_error "Push tags failed"
    return 1
  fi
  
  log_ok "Tags pushed"
}

# ============================================================================
# GITHUB RELEASE FUNCTIONS
# ============================================================================

create_github_release() {
  log_step "Creating GitHub release (if gh CLI available)"
  
  if ! check_command_exists gh; then
    log_warn "GitHub CLI (gh) not found - skipping automated release creation"
    return 0
  fi
  
  # Get AppImage and .deb paths
  local appimage
  local deb
  
  appimage=$(find dist-electron -name "*.AppImage" -type f | head -1)
  deb=$(find dist-electron -name "*.deb" -type f | head -1)
  
  if [[ -z "$appimage" ]]; then
    log_warn "AppImage not found - cannot create GitHub release"
    return 0
  fi
  
  # Create release body
  local release_body="## Melo v${TARGET_VERSION}

### Features & Fixes
- ✅ DRM fixes for Apple Music and YouTube
- ✅ Session persistence implementation
- ✅ Maximum stability improvements

### Changes
- Widevine DRM compatibility enhanced
- HEVC codec support enabled
- Service-specific User-Agents (Chrome UA)
- Persistent session partitions per service
- Advanced DRM/codec logging

### Compatibility
- Linux (AppImage, .deb)
- Widevine DRM: Enabled
- GPU rendering: Stable
- Sandbox: Maintained

### Artifacts
- **Melo-${TARGET_VERSION}.AppImage**: Universal Linux executable
- **melo_${TARGET_VERSION}_amd64.deb** (if available): Debian package"
  
  # Build gh release creation command
  local gh_cmd="gh release create ${RELEASE_TAG} --title \"Melo ${TARGET_VERSION}\" --notes \"${release_body}\" \"${appimage}\""
  
  if [[ -n "$deb" ]]; then
    gh_cmd="${gh_cmd} \"${deb}\""
  fi
  
  # Execute release creation
  if eval "${gh_cmd}"; then
    log_ok "GitHub release created successfully"
  else
    log_warn "GitHub release creation had issues (may already exist)"
    return 0
  fi
}

# ============================================================================
# MAIN WORKFLOW
# ============================================================================

print_header() {
  log_separator
  echo -e "${BLUE}   Melo Release Automation - v${TARGET_VERSION}${NC}"
  echo -e "${BLUE}   Production-Grade Release Workflow${NC}"
  log_separator
  echo ""
}

print_summary() {
  log_separator
  echo -e "${GREEN}✓ Release ${TARGET_VERSION} Created Successfully${NC}"
  log_separator
  echo ""
  echo -e "${GREEN}Release Information:${NC}"
  echo "  • Version: ${TARGET_VERSION}"
  echo "  • Tag: ${RELEASE_TAG}"
  echo "  • Branch: ${GIT_BRANCH}"
  echo "  • Commit Message: ${RELEASE_MESSAGE}"
  echo ""
  echo -e "${GREEN}Artifacts:${NC}"
  if [[ -f "$(find dist-electron -name "*.AppImage" -type f | head -1)" ]]; then
    echo "  • $(ls -lh dist-electron/*.AppImage | awk '{print $9, "(" $5 ")"}')"
  fi
  if [[ -f "$(find dist-electron -name "*.deb" -type f | head -1)" ]]; then
    echo "  • $(ls -lh dist-electron/*.deb | awk '{print $9, "(" $5 ")"}')"
  fi
  echo ""
  echo -e "${GREEN}Next Steps:${NC}"
  echo "  • Verify GitHub release: https://github.com/your-repo/releases/tag/${RELEASE_TAG}"
  echo "  • Download artifacts and test"
  echo "  • Announce release to community"
  echo ""
  log_separator
}

main() {
  print_header
  
  # Pre-flight checks
  log_info "Running pre-flight checks..."
  echo ""
  
  check_command_exists git || exit 1
  check_command_exists npm || exit 1
  check_command_exists node || exit 1
  check_git_clean || exit 1
  check_git_branch || exit 1
  check_tag_exists || exit 1
  
  echo ""
  
  # Cleanup phase
  log_info "=== CLEANUP PHASE ==="
  echo ""
  cleanup_build_cache || exit 1
  cleanup_npm_cache || exit 1
  cleanup_electron_cache || exit 1
  echo ""
  
  # Installation phase
  log_info "=== INSTALLATION PHASE ==="
  echo ""
  install_dependencies || exit 1
  echo ""
  
  # Build phase
  log_info "=== BUILD PHASE ==="
  echo ""
  build_project || exit 1
  verify_build_artifacts || exit 1
  echo ""
  
  # Version phase
  log_info "=== VERSION PHASE ==="
  echo ""
  update_version || exit 1
  echo ""
  
  # Git phase
  log_info "=== GIT OPERATIONS PHASE ==="
  echo ""
  git_commit_version || exit 1
  git_create_tag || exit 1
  git_push_main || exit 1
  git_push_tags || exit 1
  echo ""
  
  # GitHub release phase (optional)
  log_info "=== GITHUB RELEASE PHASE ==="
  echo ""
  create_github_release || exit 1
  echo ""
  
  # Final summary
  print_summary
}

# ============================================================================
# ERROR HANDLING
# ============================================================================

cleanup_on_error() {
  local line_no=$1
  log_error "Script failed at line $line_no"
  log_error "Release process incomplete - changes may be in inconsistent state"
  echo ""
  log_warn "Suggestion: Review git status and make corrections before retrying"
  exit 1
}

trap 'cleanup_on_error ${LINENO}' ERR

# ============================================================================
# EXECUTION
# ============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  cd "${PROJECT_ROOT}"
  main
fi
