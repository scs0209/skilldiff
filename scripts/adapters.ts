// Harness CLI adapters — normalize each harness's JSON event stream into tool traces.
// Shared between the live spike (scripts/spike.ts) and the recorded spike (scripts/recorded-spike.ts).

export interface ToolUse {
  tool: string;
  input: Record<string, unknown>;
}

export interface HarnessAdapter {
  name: string;
  cmd: string;
  baseArgs: string[]; // headless/print flags, prompt appended last
  extractToolUses: (line: unknown) => ToolUse[];
}

// ---- Claude Code: stream-json assistant events -------------------------
export const claudeAdapter: HarnessAdapter = {
  name: "claude-code",
  cmd: "claude",
  baseArgs: ["-p", "--output-format", "stream-json", "--verbose", "--max-turns", "5"],
  extractToolUses: (line) => {
    const msg = line as { type?: string; message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } };
    if (msg.type !== "assistant" || !msg.message?.content) return [];
    return msg.message.content
      .filter((b) => b.type === "tool_use" && b.name)
      .map((b) => ({ tool: b.name!, input: b.input ?? {} }));
  },
};

// ---- Cursor agent: stream-json events ----------------------------------
export const cursorAdapter: HarnessAdapter = {
  name: "cursor-agent",
  cmd: "cursor-agent",
  baseArgs: ["-p", "--output-format", "stream-json", "--force"],
  extractToolUses: (line) => {
    const msg = line as { type?: string; tool_call?: { name?: string; args?: Record<string, unknown> }; result?: { tool_calls?: Array<{ type?: string; name?: string; input?: Record<string, unknown>; arguments?: unknown }> } };
    if (msg.type === "tool_call" && msg.tool_call?.name) {
      return [{ tool: msg.tool_call.name, input: msg.tool_call.args ?? {} }];
    }
    if (msg.type === "result" && msg.result?.tool_calls) {
      return msg.result.tool_calls
        .filter((tc) => tc.name)
        .map((tc) => ({ tool: tc.name!, input: tc.input ?? {} }));
    }
    return [];
  },
};

// ---- Codex: exec --json headless events --------------------------------
// Handles both codex exec --json output (item.started/item.completed)
// and rollout transcript shape (response_item.function_call with exec_command).
export const codexAdapter: HarnessAdapter = {
  name: "codex",
  cmd: "codex",
  baseArgs: ["exec", "--json", "--skip-git-repo-check", "--full-auto"],
  extractToolUses: (line) => {
    const msg = line as { type?: string; item?: { type?: string; name?: string; command?: string[] } };
    if ((msg.type === "item.started" || msg.type === "item.completed") && msg.item?.type === "command_execution") {
      return [{ tool: "Bash", input: { command: (msg.item.command ?? []).join(" ") } }];
    }
    const item = line as { type?: string; payload?: { type?: string; name?: string; arguments?: string } };
    if (item.type === "response_item" && item.payload?.type === "function_call" && item.payload.name) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(item.payload.arguments ?? "{}") as Record<string, unknown>;
      } catch {
        // keep empty args if arguments is not valid JSON
      }
      const name = item.payload.name === "exec_command" ? "Bash" : item.payload.name;
      return [{ tool: name, input: args }];
    }
    return [];
  },
};

// Prefer cursor/codex; claude CLI often runs on a console account with no credits.
export const ADAPTERS = [cursorAdapter, codexAdapter, claudeAdapter];
