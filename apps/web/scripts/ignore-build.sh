#!/bin/sh
# Vercel's "Ignored Build Step" for the web (see vercel.json): exit 0 skips the
# build, any other exit builds. It skips only when it can prove nothing the web
# depends on changed since the last deployment; any doubt builds.

# Everything the web build reads, relative to the repository root.
PATHS="apps/web packages/shared bun.lock package.json turbo.json tsconfig.base.json"

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$previous" ]; then
  echo "No previous deployment to compare with: building."
  exit 1
fi

root="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$root" ]; then
  echo "Not inside a git checkout: building."
  exit 1
fi

# Vercel clones shallow, so an old deployment's commit may be missing.
if ! git -C "$root" cat-file -e "${previous}^{commit}" 2>/dev/null; then
  echo "Commit $previous is not in this clone: building."
  exit 1
fi

# --quiet exits 0 with no changes, 1 with changes, anything else on error.
# shellcheck disable=SC2086
git -C "$root" diff --quiet "$previous" HEAD -- $PATHS
status=$?
if [ "$status" -eq 0 ]; then
  echo "Nothing the web depends on changed since $previous: skipping the build."
  exit 0
fi
if [ "$status" -eq 1 ]; then
  echo "The web or something it depends on changed since $previous: building."
else
  echo "git diff failed: building."
fi
exit 1
