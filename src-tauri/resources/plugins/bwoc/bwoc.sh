#!/usr/bin/env sh
#
# bwoc.sh — LiteDuck BWOC orchestration plugin (read-only, v1).
#
# Ported from the former baked-in native integration (src-tauri/src/bwoc.rs).
# LiteDuck core has no integrations; this is now an opt-in plugin under the
# hybrid (declarative manifest + shell command) plugin system. LiteDuck spawns
# this script via `sh -c "sh bwoc.sh <verb>"` with the plugin directory as CWD.
# The script emits a single JSON object to stdout on success; on failure it
# writes a human message to stderr and exits non-zero (LiteDuck surfaces both).
#
# ── Verbs (READ-ONLY) ─────────────────────────────────────────────────────────
#   detect — resolve the `bwoc` binary + report version → {installed,version,path}
#   list   — run `bwoc list`, parse the agent roster leniently → {agents:[...]}
#
# No agents are ever spawned, stopped, or modified. There are no credentials and
# no network access (network=false in plugin.json).

set -eu

PLUGIN="bwoc"

err() { printf '%s\n' "$PLUGIN: $1" >&2; }

# JSON-escape a string for embedding in stdout output (no jq dependency).
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g'
}

VERB="${1:-}"
if [ -z "$VERB" ]; then
  err "no verb (expected: detect | list)"
  exit 2
fi

# ── parse_version: first version-looking token from `bwoc --version` ──────────
#
# The CLI prints a single line like `bwoc 2.5.0`; return the token following a
# leading "bwoc" program name, else the first token starting with a digit.
parse_version() {
  # Reads the raw --version output on stdin, prints the version token (or empty).
  awk '
    NF == 0 { next }
    {
      if ($1 == "bwoc") { print $2; exit }
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^[0-9]/) { print $i; exit }
      }
      exit
    }
  '
}

do_detect() {
  # Resolve the binary via `command -v` (POSIX equivalent of `which`).
  BWOC_PATH="$(command -v bwoc 2>/dev/null || true)"
  if [ -z "$BWOC_PATH" ]; then
    printf '{"installed":false,"version":null,"path":null}\n'
    return 0
  fi

  VERSION="$("$BWOC_PATH" --version 2>/dev/null | parse_version || true)"
  if [ -n "$VERSION" ]; then
    printf '{"installed":true,"version":"%s","path":"%s"}\n' \
      "$(json_escape "$VERSION")" "$(json_escape "$BWOC_PATH")"
  else
    printf '{"installed":true,"version":null,"path":"%s"}\n' \
      "$(json_escape "$BWOC_PATH")"
  fi
}

# ── parse_agent_row (ported from bwoc.rs) ─────────────────────────────────────
#
# Skips header / box-drawing separator / blank lines. Drops a leading status
# glyph (non-alphanumeric token), then takes the first remaining token as the
# agent name and the next token (STATUS column) as the role. Emits one JSON
# object per agent: {name, role, raw}.
do_list() {
  if ! command -v bwoc >/dev/null 2>&1; then
    err "bwoc is not installed"
    exit 2
  fi

  OUTPUT="$(bwoc list 2>/tmp/bwoc_list_err.$$ || true)"
  STATUS=$?
  if [ "$STATUS" -ne 0 ] && [ -z "$OUTPUT" ]; then
    msg="$(cat /tmp/bwoc_list_err.$$ 2>/dev/null || true)"
    rm -f /tmp/bwoc_list_err.$$
    err "'bwoc list' failed: $msg"
    exit 3
  fi
  rm -f /tmp/bwoc_list_err.$$

  printf '%s\n' "$OUTPUT" | awk '
    function jesc(s) {
      gsub(/\\/, "\\\\", s)
      gsub(/"/, "\\\"", s)
      return s
    }
    BEGIN { printf "{\"agents\":["; first = 1 }
    {
      line = $0
      # Trim leading/trailing whitespace.
      gsub(/^[[:space:]]+/, "", line)
      gsub(/[[:space:]]+$/, "", line)
      if (line == "") next

      # Skip the header row.
      if (line ~ /^ID/ && line ~ /STATUS/) next

      # Skip a box-drawing / dash separator (only dashes + whitespace).
      stripped = line
      gsub(/[[:space:]]/, "", stripped)
      gsub(/-/, "", stripped)
      gsub(/─/, "", stripped)
      if (stripped == "") next

      # Tokenize; drop a leading non-alphanumeric glyph token (e.g. ○ / ●).
      n = split(line, tok, /[[:space:]]+/)
      idx = 1
      if (n >= 1 && tok[1] !~ /[A-Za-z0-9]/) idx = 2
      name = (idx <= n) ? tok[idx] : ""
      if (name == "") next
      role = (idx + 1 <= n) ? tok[idx + 1] : ""

      if (!first) printf ","
      first = 0
      printf "{\"name\":\"%s\",", jesc(name)
      if (role == "") printf "\"role\":null,"
      else printf "\"role\":\"%s\",", jesc(role)
      printf "\"raw\":\"%s\"}", jesc(line)
    }
    END { printf "]}\n" }
  '
}

case "$VERB" in
  detect) do_detect ;;
  list)   do_list ;;
  *)      err "unknown verb '$VERB' (expected detect | list)"; exit 2 ;;
esac
