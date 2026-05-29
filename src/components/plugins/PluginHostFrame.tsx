/**
 * PluginHostFrame — renders a plugin's **executable UI** (ADR-002) inside an
 * iframe served from the `plugin://` custom scheme. That origin is cross-origin
 * to the host app (so the plugin cannot reach the host DOM or the Tauri `invoke`
 * bridge) and runs under its own restrictive CSP set per response in
 * `plugins::resolve_plugin_asset`.
 *
 * The only channel is a versioned `postMessage` bridge. The host:
 *   • authenticates inbound messages by `event.source === frame.contentWindow`
 *     (the plugin origin is cross/opaque — `event.origin` is never trusted),
 *   • answers `ready` with `init` (context),
 *   • runs `run-command` ONLY for commands the plugin declared, reusing the same
 *     `pluginRunCommand` path (no new capability), and replies `command-result`.
 *
 * The host never reads or executes the bundle itself — the isolated frame does.
 */

import { useEffect, useRef } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  type InstalledPlugin,
  pluginOpenExternal,
  pluginRunCommand,
  pluginUiUrl,
} from "@/lib/plugins";
import { createLogger } from "@/lib/logger";

const logger = createLogger("PluginHostFrame");

interface BridgeMessage {
  v?: number;
  type?: string;
  payload?: unknown;
}

/** Max wait for the plugin frame's `ready` handshake before falling back. The
 *  bootstrap posts `ready` as soon as the shell loads, so this only elapses when
 *  the `plugin://` scheme / CSP is misbehaving (e.g. a webview quirk). */
const READY_TIMEOUT_MS = 3000;

/** Wire-protocol version this host implements. The bootstrap sends `v: 1` and
 *  the host ignores any message whose `v` doesn't match, with a clear warning so
 *  a future host upgrade can refuse old plugin bundles loudly instead of silently. */
const BRIDGE_VERSION = 1;

export function PluginHostFrame({
  plugin,
  onFallback,
}: {
  plugin: InstalledPlugin;
  /** Called if the frame never hands-shakes — the caller should render the
   *  declarative fallback so the plugin is never a blank page. */
  onFallback?: () => void;
}) {
  const { workspace } = useWorkspace();
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const declared = new Set(plugin.commands.map((c) => c.id));
    let ready = false;
    const readyTimer = window.setTimeout(() => {
      if (!ready) {
        logger.warn(`plugin '${plugin.id}' UI did not hand-shake — falling back to declarative`);
        onFallback?.();
      }
    }, READY_TIMEOUT_MS);

    function onMessage(e: MessageEvent) {
      // Authenticate by the exact frame window — the plugin origin is cross/opaque,
      // so `event.origin` is meaningless here; only the contentWindow is trusted.
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const m = e.data as BridgeMessage | null;
      if (!m || typeof m.type !== "string") return;
      if (m.v !== BRIDGE_VERSION) {
        // Same-frame source, unknown wire version → loud refusal rather than
        // silently running mismatched code.
        logger.warn(
          `plugin '${plugin.id}' sent message with unsupported bridge version v=${String(m.v)} (host expects ${BRIDGE_VERSION})`,
        );
        return;
      }

      if (m.type === "ready") {
        ready = true;
        window.clearTimeout(readyTimer);
        win.postMessage(
          {
            v: 1,
            type: "init",
            payload: {
              context: {
                pluginId: plugin.id,
                workspace: workspace || null,
                dark: document.documentElement.classList.contains("dark"),
              },
            },
          },
          "*",
        );
        return;
      }

      if (m.type === "run-command") {
        const { requestId, commandId, params } = (m.payload ?? {}) as {
          requestId?: string;
          commandId?: string;
          params?: Record<string, string>;
        };
        if (typeof requestId !== "string") return;
        const reply = (r: { ok: boolean; stdout: string; stderr: string; exitCode: number }) =>
          win.postMessage({ v: 1, type: "command-result", payload: { requestId, ...r } }, "*");

        if (typeof commandId !== "string" || !declared.has(commandId)) {
          reply({
            ok: false,
            stdout: "",
            stderr: `command '${String(commandId)}' is not declared by this plugin`,
            exitCode: 1,
          });
          return;
        }
        void pluginRunCommand(plugin.id, commandId, params, workspace || undefined)
          .then((res) =>
            reply({
              ok: res.exit_code === 0,
              stdout: res.stdout,
              stderr: res.stderr,
              exitCode: res.exit_code,
            }),
          )
          .catch((err: unknown) =>
            reply({ ok: false, stdout: "", stderr: String(err), exitCode: 1 }),
          );
        return;
      }

      if (m.type === "log") {
        const p = (m.payload ?? {}) as { msg?: string };
        logger.info(`[plugin:${plugin.id}] ${p.msg ?? ""}`);
        return;
      }

      if (m.type === "open-external") {
        const { url } = (m.payload ?? {}) as { url?: string };
        if (typeof url !== "string") return;
        // Host-side validation is authoritative (plugins.rs `validate_open_external`):
        // https-only + the plugin must have declared `network: true`. Errors are
        // logged but never thrown back into the frame (no command-result for this
        // fire-and-forget capability).
        void pluginOpenExternal(plugin.id, url).catch((err: unknown) => {
          logger.warn(`plugin '${plugin.id}' open-external denied: ${String(err)}`);
        });
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("message", onMessage);
    };
  }, [plugin, workspace, onFallback]);

  return (
    <iframe
      ref={frameRef}
      title={`${plugin.name} UI`}
      src={pluginUiUrl(plugin.id)}
      // `allow-scripts` only (no `allow-same-origin`) → opaque origin: scripts run
      // but the frame cannot reach the host DOM/storage or the Tauri bridge, and
      // top-level navigation / popups / form submission are blocked. The plugin's
      // own response CSP names sources by scheme so its bundle still loads.
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-[var(--color-background)]"
    />
  );
}
