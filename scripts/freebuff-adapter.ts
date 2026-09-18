// Freebuff/Codebuff adapter — runs skills headless via @codebuff/sdk using the
// Freebuff desktop auth token (they share the same codebuff.com account system).
//
// Token resolution order:
//   1. CODEBUFF_API_KEY env var
//   2. ~/.config/freebuff-desktop/state.json -> authSessions["https://www.codebuff.com"].token

import { CodebuffClient } from "@codebuff/sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface FreebuffToolUse {
  tool: string;
  input: Record<string, unknown>;
}

export async function resolveFreebuffToken(explicit?: string): Promise<string | null> {
  if (process.env.CODEBUFF_API_KEY) return process.env.CODEBUFF_API_KEY;
  if (explicit) return explicit;
  try {
    const statePath = join(homedir(), ".config", "freebuff-desktop", "state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const token = state?.authSessions?.["https://www.codebuff.com"]?.token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export async function runFreebuffHarness(opts: {
  cwd: string;
  prompt: string;
  maxTurns?: number;
  token?: string;
  /** Skill versions to inject into the prompt (old or new skill under test). */
  skillFiles?: Array<{ name: string; path: string }>;
}): Promise<{ traces: FreebuffToolUse[]; error?: string }> {
  const token = await resolveFreebuffToken(opts.token);
  if (!token) {
    return { traces: [], error: "No Codebuff/Freebuff token. Login to Freebuff desktop or set CODEBUFF_API_KEY." };
  }

  const client = new CodebuffClient({ apiKey: token, cwd: opts.cwd });
  const traces: FreebuffToolUse[] = [];
  let error: string | undefined;

  // Skill injection: inline the skill file contents into the prompt so the agent
  // is tested ON this skill version (old vs new), not on whatever is in .claude/.
  let prompt = opts.prompt;
  if (opts.skillFiles && opts.skillFiles.length > 0) {
    const skillsBlock = await Promise.all(
      opts.skillFiles.map(async (sf) => {
        const content = await readFile(sf.path, "utf8").catch(() => `<<unreadable: ${sf.path}>>`);
        return `<skill name="${sf.name}">\n${content}\n</skill>`;
      }),
    );
    prompt = `${prompt}\n\nYou have these skills loaded. Follow the matching skill's instructions exactly:\n\n${skillsBlock.join("\n\n")}`;
  }

  const runState = await client.run({
    agent: "codebuff/base@latest",
    prompt,
    handleEvent: (event: { type: string; [k: string]: unknown }) => {
      // Tool call events carry the observable behavior we assert on.
      if (event.type === "tool_call" || event.type === "toolCall") {
        const e = event as { type: string; toolName?: string; tool?: string; input?: Record<string, unknown>; args?: Record<string, unknown> };
        traces.push({ tool: e.toolName ?? e.tool ?? "unknown", input: e.input ?? e.args ?? {} });
      } else if (event.type === "error") {
        const e = event as { message?: string };
        error = e.message ?? "unknown error";
      }
    },
  });

  // Fall back to harvesting tool calls from the message history if events were sparse
  if (traces.length === 0 && runState) {
    try {
      const steps = (runState as unknown as { steps?: Array<{ toolCall?: { toolName?: string; input?: Record<string, unknown> } }> }).steps ?? [];
      for (const step of steps) {
        if (step.toolCall?.toolName) {
          traces.push({ tool: step.toolCall.toolName, input: step.toolCall.input ?? {} });
        }
      }
    } catch {
      // best-effort fallback only
    }
  }

  void opts.maxTurns;
  return { traces, error };
}

// convenience used by the spike to verify the token works at all
export async function checkFreebuffAuth(token?: string): Promise<{ ok: boolean; user?: string; error?: string }> {
  const t = await resolveFreebuffToken(token);
  if (!t) return { ok: false, error: "no token" };
  try {
    const res = await fetch("https://www.codebuff.com/api/v1/me?fields=id,email", {
      headers: { Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = (await res.json()) as { id?: string; email?: string };
    return { ok: true, user: body.email ?? body.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
