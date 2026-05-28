// bwoc/ui.js — BWOC plugin's own UI (ADR-002 proving bundle).
//
// Runs inside the isolated `plugin://` iframe. It cannot reach the host DOM or
// Tauri; it talks to LiteDuck only through `window.liteduck` (the host-authored
// bridge bootstrap). Here it runs the plugin's declared `bwoc.list` command and
// renders the agent roster with its own markup — proving a plugin can own its UI
// without any host-side renderer. Self-contained (no imports); values are
// escaped before insertion (defence-in-depth, though the frame is isolated).

(function () {
  var root = document.getElementById("app") || document.body;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function showError(msg) {
    root.innerHTML =
      '<pre style="margin:14px;color:#e5484d;white-space:pre-wrap">' + esc(msg) + "</pre>";
  }

  root.innerHTML = '<div style="padding:14px;opacity:.7">Loading BWOC agents…</div>';

  liteduck
    .runCommand("bwoc.list")
    .then(function (res) {
      if (!res.ok) {
        showError(res.stderr || "bwoc.list failed");
        return;
      }
      var data;
      try {
        data = JSON.parse(res.stdout);
      } catch (e) {
        root.innerHTML =
          '<pre style="margin:14px;white-space:pre-wrap">' + esc(res.stdout) + "</pre>";
        return;
      }
      render((data && data.agents) || []);
    })
    .catch(function (e) {
      showError(e);
    });

  function render(agents) {
    var line = "1px solid color-mix(in srgb, currentColor 12%, transparent)";
    var rows = agents
      .map(function (a) {
        return (
          '<tr><td style="padding:7px 12px;border-top:' +
          line +
          '">' +
          esc(a.name) +
          '</td><td style="padding:7px 12px;border-top:' +
          line +
          ';opacity:.8">' +
          esc(a.role || "—") +
          "</td></tr>"
        );
      })
      .join("");

    root.innerHTML =
      '<div style="padding:14px">' +
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">' +
      '<h2 style="margin:0;font-size:15px">BWOC agents</h2>' +
      '<span style="opacity:.55;font-size:12px">' +
      agents.length +
      " registered</span>" +
      "</div>" +
      '<table style="border-collapse:collapse;width:100%;font-size:13px">' +
      '<thead><tr>' +
      '<th style="text-align:left;padding:7px 12px;opacity:.6;font-weight:600">Name</th>' +
      '<th style="text-align:left;padding:7px 12px;opacity:.6;font-weight:600">Role</th>' +
      "</tr></thead><tbody>" +
      (rows ||
        '<tr><td colspan="2" style="padding:14px;opacity:.6">No agents found in this workspace.</td></tr>') +
      "</tbody></table>" +
      "<p style=\"margin-top:12px;font-size:11px;opacity:.45\">Rendered by the plugin's own UI — isolated plugin:// iframe (ADR-002).</p>" +
      "</div>";
  }
})();
