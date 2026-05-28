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
#   list  — GET /rest/api/3/search/jql (enhanced JQL search)  → {issues:[...]}
#   view  — GET /rest/api/3/issue/<KEY>                       → {issue:{...}}
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
  case "$HTTP_STATUS" in 2*) return 0 ;; esac
  if [ "$HTTP_STATUS" = "0" ]; then
    err "$VERB: network/transport error reaching Jira"
    exit 6
  fi
  # Surface Jira's own explanation (the error body carries errorMessages + a
  # per-field errors map) so failures are actionable instead of a bare code —
  # e.g. 400 "Unbounded JQL queries are not allowed here." rather than "HTTP 400".
  detail="$(printf '%s' "$HTTP_BODY" | jq -r '
    ((.errorMessages // []) + [((.errors // {}) | to_entries[] | "\(.key): \(.value)")]) | join("; ")
  ' 2>/dev/null || true)"
  [ "$detail" = "null" ] && detail=""
  suffix=""
  [ -n "$detail" ] && suffix=" — $detail"
  case "$HTTP_STATUS" in
    401|403) err "$VERB: authentication failed (HTTP $HTTP_STATUS) — rotate JIRA_TOKEN or check JIRA_EMAIL$suffix"; exit 3 ;;
    404)     err "$VERB: not found (HTTP 404)$suffix"; exit 5 ;;
    429)     err "$VERB: rate limited (HTTP 429) — retry later$suffix"; exit 4 ;;
    400)     err "$VERB: bad request (HTTP 400)$suffix"; exit 6 ;;
    *)       err "$VERB: Jira returned HTTP $HTTP_STATUS$suffix"; exit 6 ;;
  esac
}

# ── Verb: list — JQL search ───────────────────────────────────────────────────

do_list() {
  require_auth

  # Build the JQL. An explicit `jql` param is an advanced full-query override
  # (used as-is); otherwise we AND together the simple filters:
  #   • assignee — DEFAULTS to the current user ("me") so the list lands on *your*
  #     issues. "unassigned" → IS EMPTY; "any"/"all"/empty → no assignee clause.
  #   • project  — optional board/project scope (a Jira board maps to a project),
  #     e.g. "ALE". Empty → no project clause.
  # A restriction is mandatory: the enhanced /search/jql endpoint rejects
  # unbounded queries (a bare ORDER BY → HTTP 400 "Unbounded JQL queries are not
  # allowed here"). If no filter yields a clause we fall back to a time bound.
  jql_override="${LITEDUCK_PARAM_JQL:-}"
  assignee="$(printf '%s' "${LITEDUCK_PARAM_ASSIGNEE:-me}" | tr -d '"')"
  project="$(printf '%s' "${LITEDUCK_PARAM_PROJECT:-}" | tr -d '"')"

  if [ -n "$jql_override" ]; then
    jql="$jql_override"
  else
    where=""
    add_clause() { where="${where:+$where AND }$1"; }
    case "$assignee" in
      me|Me|ME|currentUser|currentuser)             add_clause "assignee = currentUser()" ;;
      unassigned|Unassigned|UNASSIGNED|empty|EMPTY) add_clause "assignee IS EMPTY" ;;
      ""|any|Any|ANY|all|All|ALL)                   : ;;
      *)                                            add_clause "assignee = \"$assignee\"" ;;
    esac
    [ -n "$project" ] && add_clause "project = \"$project\""
    # Guard against an unbounded query (e.g. assignee=any with no project).
    [ -z "$where" ] && where="updated >= -30d"
    jql="$where ORDER BY updated DESC"
  fi

  max="${LITEDUCK_PARAM_MAX_RESULTS:-25}"
  case "$max" in (*[!0-9]*|'') max=25 ;; esac
  [ "$max" -gt "$MAX_PAGE" ] && max="$MAX_PAGE"

  # Enhanced JQL search: the legacy /rest/api/3/search endpoint was removed by
  # Atlassian (returns 410 Gone). /search/jql is token-paginated (nextPageToken),
  # NOT offset-paginated — `startAt` is invalid here and is dropped. The endpoint
  # returns only id+key unless `fields` is requested, so it is always passed.
  # For a bounded v1 list we fetch a single page (no nextPageToken follow-up).
  http_get "${BASE_URL}${API_BASE}/search/jql" \
    -G --data-urlencode "jql=${jql}" \
       --data-urlencode "maxResults=${max}" \
       --data-urlencode "fields=summary,status,assignee"
  classify

  # The /search/jql response has no `total`/`startAt` (just issues + nextPageToken
  # + isLast); report total as the count of issues in this page.
  printf '%s' "$HTTP_BODY" | jq '{
    ok: true,
    verb: "list",
    total: (.issues | length),
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

  # Emit the keyvalue contract ({ pairs: [[key, value], …] }) so LiteDuck renders
  # the issue as a labeled key/value card rather than a wall of raw JSON.
  printf '%s' "$HTTP_BODY" | jq '{
    pairs: [
      ["Key",      .key],
      ["Summary",  (.fields.summary // "—")],
      ["Status",   (.fields.status.name // "—")],
      ["Assignee", (.fields.assignee.displayName // .fields.assignee.emailAddress // "—")]
    ]
  }'
}

case "$VERB" in
  list) do_list ;;
  view) do_view ;;
  *)    err "unknown verb '$VERB' (expected list | view)"; exit 2 ;;
esac
