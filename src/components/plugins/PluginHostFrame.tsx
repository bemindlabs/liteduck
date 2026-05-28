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
import { type InstalledPlugin, pluginRunCommand, pluginUiUrl } from "@/lib/plugins";
import { createLogger } from "@/lib/logger";

const logger = createLogger("PluginHostFrame");

interface BridgeMessage {
  v?: number;
  type?: string;
  payload?: unknown;
}

export function PluginHostFrame({ plugin }: { plugin: InstalledPlugin }) {
  const { workspace } = useWorkspace();
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const declared = new Set(plugin.commands.map((c) => c.id));

    function onMessage(e: MessageEvent) {
      // Authenticate by the exact frame window — the plugin origin is cross/opaque,
      // so `event.origin` is meaningless here; only the contentWindow is trusted.
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const m = e.data as BridgeMessage | null;
      if (m?.v !== 1 || typeof m.type !== "string") return;

      if (m.type === "ready") {
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
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [plugin, workspace]);

  return (
    <iframe
      ref={frameRef}
      title={`${plugin.name} UI`}
      src={pluginUiUrl(plugin.id)}
      className="h-full w-full border-0 bg-[var(--color-background)]"
    />
  );
}
