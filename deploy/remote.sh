#!/usr/bin/env bash
#
# Deploy from your own machine. You never log in to the server.
#
#   deploy/remote.sh staging      # branch `staging` -> rise.happypath.solutions
#   deploy/remote.sh production   # branch `main`    -> app.riseproject.space
#
# Both environments run the same script on their own host. This one only
# chooses which host to ask, so the branch names below are documentation, not
# arguments: the server deploys whichever branch its own checkout is on, and
# editing a name here would not change that.
#
# --force re-runs install, build and restart even when the server already sits
# at the commit it would fetch. Needed only after someone has moved a checkout
# by hand, which makes the server's own "no changes" guard skip the work and
# report success without restarting anything.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The defaults are *ours*. A school running its own copy sets these instead of
# editing the file, the same way provision-production.sh takes RISE_DOMAIN.
case "${1:-}" in
  staging)    HOST="${RISE_STAGING_HOST:-rise.happypath.solutions}"; BRANCH="staging"; CONFIRM=0 ;;
  production) HOST="${RISE_PRODUCTION_HOST:-app.riseproject.space}"; BRANCH="main";    CONFIRM=1 ;;
  *)
    echo "usage: ${0##*/} {staging|production} [--force]" >&2
    echo >&2
    echo "  staging      branch 'staging' -> rise.happypath.solutions" >&2
    echo "  production   branch 'main'    -> app.riseproject.space" >&2
    exit 2 ;;
esac

FORCE=""
if [[ "${2:-}" == "--force" ]]; then
  FORCE="RISE_DEPLOY_REEXEC=1 "
elif [[ -n "${2:-}" ]]; then
  echo "unknown option: $2" >&2
  exit 2
fi

# Read the target commit from the remote, not from this clone. A forgotten
# `git push` then shows up here as a warning, rather than later as a deploy
# that ran perfectly and shipped nothing.
REMOTE_SHA="$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)"
if [[ -z "$REMOTE_SHA" ]]; then
  echo "origin has no branch '$BRANCH'" >&2
  exit 1
fi

SUBJECT="$(git log -1 --format=%s "$REMOTE_SHA" 2>/dev/null || echo '(not in this clone — git fetch to see it)')"

echo "=============================================================="
echo " environment : $1"
echo " host        : $HOST"
echo " branch      : $BRANCH"
echo " commit      : ${REMOTE_SHA:0:7}  $SUBJECT"
echo "=============================================================="

if git rev-parse --verify --quiet "$BRANCH" >/dev/null 2>&1; then
  LOCAL_SHA="$(git rev-parse "$BRANCH")"
  if [[ "$LOCAL_SHA" != "$REMOTE_SHA" ]]; then
    echo
    echo " WARNING  your local $BRANCH is at ${LOCAL_SHA:0:7}, origin is at ${REMOTE_SHA:0:7}."
    echo "          The server deploys origin. Push first if you meant to ship your work."
  fi
fi

# Production gets a typed confirmation rather than a y/n. The schools are on
# it during the testing window, and "yes" is too easy to answer by reflex.
if (( CONFIRM )); then
  echo
  echo " This is PRODUCTION. The schools use it."
  read -r -p " Type 'production' to continue: " answer
  if [[ "$answer" != "production" ]]; then
    echo "aborted"
    exit 1
  fi
fi

echo
ssh "deploy@$HOST" "${FORCE}/opt/apps/rise/current/deploy/deploy-production.sh"
