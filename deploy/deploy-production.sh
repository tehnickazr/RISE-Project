#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/apps/rise/current"
BRANCH="${1:-production}"
SERVICE_NAME="rise"

cd "$APP_DIR"

git fetch origin
git checkout "$BRANCH"

CURRENT_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/$BRANCH")"

# Skip the no-changes check on re-exec: the prior pass already advanced HEAD,
# so by definition there are "no new changes" relative to origin — but we
# still need to run the install/build/restart steps with the new in-memory
# script.
if [[ "${RISE_DEPLOY_REEXEC:-}" != "1" ]]; then
  if [[ "$CURRENT_HEAD" == "$REMOTE_HEAD" ]]; then
    echo "No changes on origin/$BRANCH. Skipping deploy."
    exit 0
  fi
  git reset --hard "origin/$BRANCH"
  # Only re-exec if THIS script changed — otherwise it's a wasted process.
  if git diff --name-only "$CURRENT_HEAD" "$REMOTE_HEAD" -- deploy/deploy-production.sh | grep -q .; then
    export RISE_DEPLOY_REEXEC=1
    exec "$0" "$@"
  fi
fi

# Backend: production deps only
(cd backend && npm install --omit=dev)

# Run migrations (idempotent). Load env from the systemd EnvironmentFile so
# DATABASE_URL is available — npm run migrate is invoked outside systemd.
ENV_FILE="/opt/apps/rise/shared/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
(cd backend && npm run migrate)

# Frontend: explicitly include dev deps (vite, @vitejs/plugin-react) — without
# --include=dev, NODE_ENV=production inherited from the env file would make
# npm skip them and `vite build` would fail with "vite: not found".
(cd frontend && npm install --include=dev && npm run build)

sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
