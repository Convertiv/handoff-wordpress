#!/usr/bin/env bash
set -euo pipefail

SLUG="handoff-blocks"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ─── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { printf "${CYAN}▸ %s${NC}\n" "$*"; }
ok()    { printf "${GREEN}✔ %s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}⚠ %s${NC}\n" "$*"; }
fatal() { printf "${RED}✖ %s${NC}\n" "$*" >&2; exit 1; }

# ─── usage ────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 <patch|minor|major|x.y.z> [--dry-run] [--skip-build] [--no-push]

Bump version, build, package, tag, and create a GitHub Release.

Options:
  --dry-run     Show what would happen without making changes
  --skip-build  Skip compiler + webpack build (use existing build/ output)
  --no-push     Create commit and tag locally but don't push or create a release
EOF
  exit 1
}

# ─── parse args ───────────────────────────────────────────────────────────────
VERSION_ARG=""
DRY_RUN=false
SKIP_BUILD=false
NO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --no-push)    NO_PUSH=true ;;
    -h|--help)    usage ;;
    *)            VERSION_ARG="$arg" ;;
  esac
done

[[ -z "$VERSION_ARG" ]] && usage

# ─── prerequisites ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fatal "node is required"
command -v npm  >/dev/null 2>&1 || fatal "npm is required"
command -v gh   >/dev/null 2>&1 || fatal "gh (GitHub CLI) is required — brew install gh"
command -v jq   >/dev/null 2>&1 || fatal "jq is required — brew install jq"
command -v zip  >/dev/null 2>&1 || fatal "zip is required"

if ! gh auth status >/dev/null 2>&1; then
  fatal "Not authenticated with GitHub CLI. Run: gh auth login"
fi

if [[ -n "$(git status --porcelain)" ]]; then
  fatal "Working directory is not clean. Commit or stash changes first."
fi

# ─── resolve version ─────────────────────────────────────────────────────────
CURRENT=$(jq -r .version package.json)

bump_version() {
  local cur="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$cur"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
    *)     echo "$part" ;;
  esac
}

case "$VERSION_ARG" in
  patch|minor|major) NEXT=$(bump_version "$CURRENT" "$VERSION_ARG") ;;
  *)
    if [[ ! "$VERSION_ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      fatal "Invalid version: $VERSION_ARG (use patch, minor, major, or x.y.z)"
    fi
    NEXT="$VERSION_ARG"
    ;;
esac

info "Version: ${CURRENT} → ${NEXT}"

if $DRY_RUN; then
  warn "Dry run — no files will be modified"
  echo ""
  info "Would update version in:"
  echo "  • package.json"
  echo "  • composer.json"
  echo "  • handoff-blocks.php"
  echo ""
  info "Would build: compiler + webpack"
  info "Would package: ${SLUG}-${NEXT}.zip"
  info "Would commit, tag v${NEXT}, push, and create GitHub Release"
  exit 0
fi

# ─── bump versions ────────────────────────────────────────────────────────────
info "Bumping versions to ${NEXT}"

# package.json
jq --arg v "$NEXT" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
ok "package.json"

# composer.json
jq --arg v "$NEXT" '.version = $v' composer.json > composer.json.tmp && mv composer.json.tmp composer.json
ok "composer.json"

# handoff-blocks.php — update the "Version:" plugin header
sed -i.bak "s/^ \* Version: .*/ * Version: ${NEXT}/" handoff-blocks.php && rm -f handoff-blocks.php.bak
ok "handoff-blocks.php"

# ─── build ────────────────────────────────────────────────────────────────────
if $SKIP_BUILD; then
  warn "Skipping build (--skip-build)"
else
  info "Installing dependencies"
  npm ci --ignore-scripts

  info "Building compiler"
  npm run build:compiler

  info "Building webpack bundles"
  npm run build
  ok "Build complete"
fi

# ─── package ZIP ──────────────────────────────────────────────────────────────
ZIP_NAME="${SLUG}-${NEXT}.zip"
STAGE_DIR=$(mktemp -d)
DEST="${STAGE_DIR}/${SLUG}"

info "Packaging ${ZIP_NAME}"

rsync -a \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='node_modules' \
  --exclude='.wp-env.json' \
  --exclude='.wp-env.override.json' \
  --exclude='compiler/src' \
  --exclude='compiler/node_modules' \
  --exclude='compiler/tsconfig.json' \
  --exclude='compiler/esbuild.config.mjs' \
  --exclude='compiler/package.json' \
  --exclude='compiler/package-lock.json' \
  --exclude='compiler/dist/index.js' \
  --exclude='compiler/dist/index.unbundled.js' \
  --exclude='compiler/dist/generators' \
  --exclude='compiler/dist/validators' \
  --exclude='compiler/dist/types.*' \
  --exclude='uploads' \
  --exclude='*.plan.md' \
  --exclude='.cursor' \
  --exclude='scripts' \
  ./ "$DEST/"

(cd "$STAGE_DIR" && zip -qr "${ROOT}/${ZIP_NAME}" "${SLUG}")
rm -rf "$STAGE_DIR"

ok "Created ${ZIP_NAME} ($(du -h "$ZIP_NAME" | cut -f1))"

# ─── git commit + tag ─────────────────────────────────────────────────────────
info "Committing version bump"
git add package.json composer.json handoff-blocks.php
git commit -m "release: v${NEXT}"
git tag -a "v${NEXT}" -m "v${NEXT}"
ok "Tagged v${NEXT}"

# ─── push + release ──────────────────────────────────────────────────────────
if $NO_PUSH; then
  warn "Skipping push and GitHub Release (--no-push)"
  info "To push later: git push && git push --tags"
  info "ZIP is at: ${ROOT}/${ZIP_NAME}"
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
info "Pushing ${BRANCH} + tags"
git push origin "$BRANCH" --tags

info "Creating GitHub Release v${NEXT}"
gh release create "v${NEXT}" \
  "${ZIP_NAME}" \
  --title "v${NEXT}" \
  --generate-notes

rm -f "$ZIP_NAME"

ok "Released v${NEXT} — https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/releases/tag/v${NEXT}"
