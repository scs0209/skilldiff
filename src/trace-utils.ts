// skilldiff v0.1 — helpers to build a RunTrace from harness output.

import { execFileSync } from "node:child_process";
import { normalizeToolName, type RunTrace } from "./assertions.js";

interface ToolUse {
  tool: string;
  input: Record<string, unknown>;
}

/**
 * Derive commandsRun from bash-like tool calls.
 * Handles both `command: "..."` (string) and `command: ["..."]` (argv array) shapes.
 */
export function extractCommands(toolCalls: ToolUse[]): string[] {
  const commands: string[] = [];
  for (const tc of toolCalls) {
    if (normalizeToolName(tc.tool) !== "bash") continue;
    const cmd = tc.input.command ?? tc.input.cmd ?? tc.input.script;
    if (typeof cmd === "string") {
      commands.push(cmd);
    } else if (Array.isArray(cmd)) {
      commands.push(cmd.join(" "));
    }
  }
  return commands;
}

/**
 * Diff the fixture working tree against the harness's starting point using git.
 * Falls back to an empty list if the fixture is not a git repo.
 */
export function detectFilesChanged(fixtureRoot: string): string[] {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: fixtureRoot, encoding: "utf8" });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\S+\s+/, "")) // strip status code, keep path
      .map((line) => line.replace(/^"(.*)"$/, "$1")); // unquote paths with spaces
  } catch {
    return [];
  }
}

/**
 * Build a complete RunTrace from raw tool calls + final output.
 * Optionally takes filesChanged if the caller tracked it differently (e.g. pre/post snapshot).
 */
export function buildTrace(opts: {
  toolCalls: ToolUse[];
  output: string;
  fixtureRoot?: string;
  filesChanged?: string[];
  warnings?: string[];
}): RunTrace {
  const filesChanged = opts.filesChanged ?? (opts.fixtureRoot ? detectFilesChanged(opts.fixtureRoot) : []);
  return {
    toolCalls: opts.toolCalls,
    filesChanged,
    commandsRun: extractCommands(opts.toolCalls),
    output: opts.output,
    warnings: opts.warnings ?? [],
  };
}
