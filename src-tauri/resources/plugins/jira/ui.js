// jira/ui.js — Jira plugin's own UI (ADR-002 rich showcase).
//
// Runs inside the isolated `plugin://` iframe; talks to LiteDuck only via the
// `window.liteduck` bridge. Renders an interactive issue browser: assignee +
// project/board filters that re-run the declared `jira.list` command with
// params, a status badge per row, and monospace keys. Self-contained (no
// imports); all values escaped before insertion (defence-in-depth).

(function () {
  var root = document.getElementById("app") || document.body;
  var state = { assignee: "me", project: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var LINE = "1px solid color-mix(in srgb, currentColor 12%, transparent)";

  function field(id, label, val, ph) {
    return (
      '<label style="display:flex;flex-direction:column;gap:3px;font-size:12px;opacity:.85">' +
      esc(label) +
      '<input id="' +
      id +
      '" value="' +
      esc(val) +
      '" placeholder="' +
      esc(ph) +
      '" style="padding:5px 8px;border-radius:6px;border:' +
      LINE +
      ';background:transparent;color:inherit;min-width:160px"></label>'
    );
  }

  function shell() {
    root.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;font:13px/1.5 -apple-system,system-ui,sans-serif">' +
      '<form id="f" style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;padding:12px;border-bottom:' +
      LINE +
      '">' +
      field("assignee", "Assignee", state.assignee, "me · unassigned · any") +
      field("project", "Project / board", state.project, "e.g. ALE") +
      '<button type="submit" style="padding:6px 14px;border-radius:6px;border:' +
      LINE +
      ';background:transparent;color:inherit;cursor:pointer">Search</button>' +
      "</form>" +
      '<div id="body" style="flex:1;overflow:auto;padding:12px"></div>' +
      "</div>";
    document.getElementById("f").addEventListener("submit", function (e) {
      e.preventDefault();
      state.assignee = document.getElementById("assignee").value;
      state.project = document.getElementById("project").value;
      load();
    });
  }

  function setBody(html) {
    var b = document.getElementById("body");
    if (b) b.innerHTML = html;
  }

  function load() {
    setBody('<div style="opacity:.6">Loading…</div>');
    var params = {};
    if (state.assignee.trim()) params.assignee = state.assignee.trim();
    if (state.project.trim()) params.project = state.project.trim();
    liteduck
      .runCommand("jira.list", params)
      .then(function (res) {
        if (!res.ok) {
          setBody('<pre style="color:#e5484d;white-space:pre-wrap">' + esc(res.stderr || "jira.list failed") + "</pre>");
          return;
        }
        var data;
        try {
          data = JSON.parse(res.stdout);
        } catch (e) {
          setBody('<pre style="white-space:pre-wrap">' + esc(res.stdout) + "</pre>");
          return;
        }
        render((data && data.issues) || []);
      })
      .catch(function (e) {
        setBody('<pre style="color:#e5484d">' + esc(e) + "</pre>");
      });
  }

  function th(t) {
    return '<th style="text-align:left;padding:6px 10px;opacity:.6;font-weight:600">' + esc(t) + "</th>";
  }
  function badge(s) {
    if (!s) return "—";
    return (
      '<span style="padding:1px 8px;border-radius:10px;font-size:11px;background:color-mix(in srgb, currentColor 12%, transparent)">' +
      esc(s) +
      "</span>"
    );
  }

  function render(issues) {
    var rows = issues
      .map(function (it) {
        return (
          "<tr>" +
          '<td style="padding:6px 10px;border-top:' +
          LINE +
          ';font-family:ui-monospace,monospace;white-space:nowrap">' +
          esc(it.key) +
          "</td>" +
          '<td style="padding:6px 10px;border-top:' + LINE + '">' + esc(it.summary) + "</td>" +
          '<td style="padding:6px 10px;border-top:' + LINE + ';white-space:nowrap">' + badge(it.status) + "</td>" +
          '<td style="padding:6px 10px;border-top:' + LINE + ';opacity:.8;white-space:nowrap">' +
          esc(it.assignee || "—") +
          "</td></tr>"
        );
      })
      .join("");

    setBody(
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">' +
      "<strong>" + issues.length + " issues</strong>" +
      "<span style=\"opacity:.5;font-size:11px\">Rendered by the plugin's own UI — isolated plugin:// iframe</span>" +
      "</div>" +
      '<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>' +
      th("Key") + th("Summary") + th("Status") + th("Assignee") +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="4" style="padding:14px;opacity:.6">No issues.</td></tr>') +
      "</tbody></table>",
    );
  }

  shell();
  load();
})();
