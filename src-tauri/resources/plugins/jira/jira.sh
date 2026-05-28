#!/usr/bin/env sh
#
# jira.sh — LiteDuck Jira Cloud plugin (read-only, v1).
#
# The first proving plugin of LiteDuck's hybrid (declarative manifest + shell
# command) plugin system. LiteDuck spawns this script via `sh -c "sh jira.sh
# <verb>"` with the plugin directory as CWD and the caller's UI params exported
# as LITEDUCK_PARAM_<KEY> env vars. The script emits a single JSON object to
# stdout on success; on failure it writes a human message to stderr and exits
# non-zero (LiteDuck surfaces both).
#
# ── Verbs (READ-ONLY in v1) ──────────────────────────────────────────────────
#   list  — GET /rest/api/3/search  (JQL, bounded paging)   → {issues:[...]}
#   view  — GET /rest/api/3/issue/<KEY>                      → {issue:{...}}
# Write / transition is deliberately NOT implemented in v1 (avoids the
# write-confirmation-gate complexity); it is a documented follow-up.
#
# ── Authentication (Atlassian Basic = email:api_token) ───────────────────────
# Credentials resolve at runtime, never from a committed file:
#   1. Environment (preferred — nothing touches disk):
#        JIRA_EMAIL     account email (Basic-auth username half)
#        JIRA_TOKEN     API token     (Basic-auth password half — THE SECRET)
#        JIRA_BASE_URL  https://<site>.atlassian.net
#   2. A gitignored, owner-only auth.toml (chmod 600) in this plugin directory.
# The token is read straight into curl's -u; it is never echoed, never written
# to a file, and never placed in any JSON output.

set -eu

PLUGIN="jira"
API_BASE="/rest/api/3"
MAX_PAGE=100

err() { printf '%s\n' "$PLUGIN: $1" >&2; }

for cmd in jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "required command '$cmd' not found on PATH"
    exit 1
  fi
done

VERB="${1:-}"
if [ -z "$VERB" ]; then
  err "no verb (expected: list | view)"
  exit 2
fi

# ── Resolve auth: env first, then a chmod-600 auth.toml ──────────────────────

EMAIL="${JIRA_EMAIL:-}"
TOKEN="${JIRA_TOKEN:-}"
BASE_URL="${JIRA_BASE_URL:-}"

AUTH_FILE="${LITEDUCK_PLUGIN_DIR:-.}/auth.toml"
if [ -f "$AUTH_FILE" ]; then
  # Refuse to read a credentials file that is not owner-only (chmod 600).
  if [ "$(uname)" = "Darwin" ]; then
    PERM="$(stat -f '%Lp' "$AUTH_FILE" 2>/dev/null || echo '')"
  else
    PERM="$(stat -c '%a' "$AUTH_FILE" 2>/dev/null || echo '')"
  fi
  if [ -n "$PERM" ] && [ "$PERM" != "600" ]; then
    err "refusing to read $AUTH_FILE: permissions are $PERM, expected 600 (run: chmod 600 \"$AUTH_FILE\")"
    exit 2
  fi
  # Pull values only for inputs not already set by the environment.
  toml_val() {
    sed -n 's/^[[:space:]]*'"$1"'[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' "$AUTH_FILE" | head -n1
  }
  [ -z "$EMAIL" ]    && EMAIL="$(toml_val email)"
  [ -z "$TOKEN" ]    && TOKEN="$(toml_val token)"
  [ -z "$BASE_URL" ] && BASE_URL="$(toml_val base_url)"
fi

require_auth() {
  missing=""
  [ -n "$EMAIL" ]    || missing="$missing JIRA_EMAIL"
  [ -n "$TOKEN" ]    || missing="$missing JIRA_TOKEN"
  [ -n "$BASE_URL" ] || missing="$missing JIRA_BASE_URL"
  if [ -n "$missing" ]; then
    err "missing Jira credentials:$missing — set the JIRA_* env vars (or fill ~/.liteduck/plugins/jira/auth.toml, chmod 600). Never commit the token."
    exit 2
  fi
  BASE_URL="${BASE_URL%/}"
}

# ── HTTP (read-only GET) ──────────────────────────────────────────────────────

http_get() {
  # http_get <url> [curl-args...] → prints body; sets HTTP_STATUS.
  url="$1"; shift
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN 2>/dev/null || true
  HTTP_STATUS="$(curl -sS -u "$EMAIL:$TOKEN" -H "Accept: application/json" \
    -o "$tmp" -w '%{http_code}' "$@" "$url" 2>/dev/null || echo 0)"
  HTTP_BODY="$(cat "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"
}

classify() {
  case "$HTTP_STATUS" in
    2*) return 0 ;;
    0)   err "$VERB: network/transport error reaching Jira"; exit 6 ;;
    401|403) err "$VERB: authentication failed (HTTP $HTTP_STATUS) — rotate JIRA_TOKEN or check JIRA_EMAIL"; exit 3 ;;
    404) err "$VERB: not found (HTTP 404)"; exit 5 ;;
    429) err "$VERB: rate limited (HTTP 429) — retry later"; exit 4 ;;
    *)   err "$VERB: Jira returned HTTP $HTTP_STATUS"; exit 6 ;;
  esac
}

# ── Verb: list — JQL search ───────────────────────────────────────────────────

do_list() {
  require_auth
  jql="${LITEDUCK_PARAM_JQL:-order by updated DESC}"
  max="${LITEDUCK_PARAM_MAX_RESULTS:-25}"
  case "$max" in (*[!0-9]*|'') max=25 ;; esac
  [ "$max" -gt "$MAX_PAGE" ] && max="$MAX_PAGE"

  http_get "${BASE_URL}${API_BASE}/search" \
    -G --data-urlencode "jql=${jql}" \
       --data-urlencode "startAt=0" \
       --data-urlencode "maxResults=${max}" \
       --data-urlencode "fields=summary,status,assignee"
  classify

  printf '%s' "$HTTP_BODY" | jq '{
    ok: true,
    verb: "list",
    total: (.total // 0),
    issues: [ .issues[]? | {
      key: .key,
      summary: (.fields.summary // null),
      status: (.fields.status.name // null),
      assignee: (.fields.assignee.displayName // .fields.assignee.emailAddress // null)
    } ]
  }'
}

# ── Verb: view — single issue ─────────────────────────────────────────────────

do_view() {
  require_auth
  issue="${LITEDUCK_PARAM_ISSUE:-}"
  if [ -z "$issue" ]; then
    err "view: param 'issue' is required (e.g. PROJ-123)"
    exit 2
  fi

  http_get "${BASE_URL}${API_BASE}/issue/${issue}?fields=summary,status,assignee,description"
  classify

  printf '%s' "$HTTP_BODY" | jq '{
    ok: true,
    verb: "view",
    issue: {
      key: .key,
      summary: (.fields.summary // null),
      status: (.fields.status.name // null),
      assignee: (.fields.assignee.displayName // .fields.assignee.emailAddress // null)
    }
  }'
}

case "$VERB" in
  list) do_list ;;
  view) do_view ;;
  *)    err "unknown verb '$VERB' (expected list | view)"; exit 2 ;;
esac
