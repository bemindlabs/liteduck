# Jira Cloud Plugin (LiteDuck)

The **first proving plugin** of LiteDuck's plugin system (hybrid: declarative
manifest + shell command, design note `2026-05-28_plugin-system-design.md`).
LiteDuck core has no integrations; this plugin is the sanctioned, opt-in
extension point. It is **read-only in v1**.

## Layout

```
jira/
  plugin.json   declares id/name/version/kind/commands/network/paths
  jira.sh       POSIX shell — calls Atlassian REST v3, emits JSON to stdout
  auth.toml     auth CONTRACT (shape only; placeholders) — real one in user home
  SPEC.md       this file
```

The bundled copy ships under `src-tauri/resources/plugins/jira/`. The user
installs it to `~/.liteduck/plugins/jira/` (via the Plugins panel install
action, or by copying the folder).

## Manifest (`kind: integration`, `network = true`)

`network = true` and the declared `paths` are surfaced in the install
confirmation UI. There is no OS sandbox in v1 — plugins run as subprocesses with
the user's privileges (user-trust v1). A real sandbox is a future phase.

## Commands

| id          | title                     | verb   | HTTP                                  |
|-------------|---------------------------|--------|---------------------------------------|
| `jira.list` | Jira: List Issues (JQL)   | `list` | `GET /rest/api/3/search` (bounded JQL)|
| `jira.view` | Jira: View Issue          | `view` | `GET /rest/api/3/issue/<KEY>`         |

LiteDuck spawns `sh jira.sh <verb>` and exports UI params as
`LITEDUCK_PARAM_<KEY>` env vars (`jql`, `max_results`, `issue`).

## Authentication

Atlassian Cloud REST v3 uses **HTTP Basic = `email:api_token`**. Inputs resolve
at runtime (first hit wins):

| Input        | Env var         | auth.toml key | Role                          |
|--------------|-----------------|---------------|-------------------------------|
| Account email| `JIRA_EMAIL`    | `email`       | Basic-auth username half      |
| API token    | `JIRA_TOKEN`    | `token`       | Basic-auth password — SECRET  |
| Site URL     | `JIRA_BASE_URL` | `base_url`    | `https://<site>.atlassian.net`|

The token is read straight into `curl -u`. It is never echoed, written, or
emitted. `jira.sh` **refuses to run** if any of the three is missing (clear
`auth_missing` error) and **refuses to read** `auth.toml` unless it is owner-only
(`chmod 600`).

## Error classes

`2xx` success · `401/403` re-authenticate · `404` not found · `429` rate-limited
(retry later) · `0`/other transport error. Each exits non-zero with a human
message on stderr.

## Deferred (NOT in v1)

- **Write / transition** (status changes, field edits) — needs a
  write-confirmation gate; deferred.
- **Project-scoped JQL config**, paging beyond the first page.
- **A real OS sandbox** for the subprocess (network/path enforcement).
