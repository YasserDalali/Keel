#!/usr/bin/env bash
# Upload Worker bindings from repo-root .env to Cloudflare (wrangler secret put).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE} — copy .env.example to .env and fill in values." >&2
  exit 1
fi

# Worker bindings only (VITE_* is frontend-only and not uploaded here).
KEYS=(
  JWT_SECRET
  TURNSTILE_SECRET
  PII_ENCRYPTION_KEY
  DIDIT_API_KEY
  DIDIT_WORKFLOW_ID
  DIDIT_WEBHOOK_SECRET
  DIDIT_SESSION_CREATE_URL
  PLAID_CLIENT_ID
  PLAID_SECRET
  PLAID_BASE_URL
  PLAID_SANDBOX_INSTITUTION
  STRIPE_SECRET_KEY
  STRIPE_PUBLISHABLE_KEY
  PAYPAL_CLIENT_ID
  PAYPAL_SECRET
  LOAN_FLAT_INTEREST_RATE
  LOAN_UPFRONT_THRESHOLD
  LOAN_UPFRONT_PCT
  RISK_SCORE_THRESHOLD
)

OPTIONAL_KEYS=(PAYPAL_CLIENT_ID PAYPAL_SECRET)

get_env() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}"
}

is_optional() {
  local key="$1"
  for opt in "${OPTIONAL_KEYS[@]}"; do
    [[ "$opt" == "$key" ]] && return 0
  done
  return 1
}

cd "$ROOT"

for key in "${KEYS[@]}"; do
  value="$(get_env "$key")"
  if [[ -z "$value" ]]; then
    if is_optional "$key"; then
      echo "Skipping ${key} (empty in .env)"
      continue
    fi
    echo "Missing or empty ${key} in ${ENV_FILE}" >&2
    exit 1
  fi
  echo "Uploading ${key}..."
  printf '%s' "$value" | npx wrangler secret put "$key"
done

echo "Done — ${#KEYS[@]} keys processed."
