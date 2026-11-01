#!/usr/bin/env bash
set -euo pipefail

: "${VERCEL_TOKEN:?Set VERCEL_TOKEN in the GitHub Actions secret store}"
: "${VERCEL_TEAM_ID:?Set VERCEL_TEAM_ID in the GitHub Actions secret store}"
: "${DEPLOYMENT_URL:?Set DEPLOYMENT_URL to the last known-good production deployment URL}"
if [ "${CONFIRM_PRODUCTION_ROLLBACK:-}" != "YES" ]; then
  echo "Refusing to roll back production. Set CONFIRM_PRODUCTION_ROLLBACK=YES only after verifying the target deployment."
  exit 2
fi
case "$DEPLOYMENT_URL" in
  https://*.vercel.app|https://*.*) ;;
  *) echo "Deployment URL must be an HTTPS Vercel deployment URL."; exit 2 ;;
esac

npx --yes vercel@latest rollback "$DEPLOYMENT_URL" --token "$VERCEL_TOKEN" --scope "$VERCEL_TEAM_ID"
