// skilldiff v0.1 — the 5 assertion kinds, evaluated against a run trace.
// All matching is partial (substring / set membership) per design-decisions.md.

import type { Expectations } from "./scenario.js";

/** Normalized tool name — harnesses name the same tool differently. */
export function normalizeToolName(tool: string): string {
  const t = tool.toLowerCase();
  if (/read|view_file|open_file/.test(t)) return "read";
  if (/write|create_file|new_file|edit|str_replace|update_file|multiedit/.test(t)) return "write";
  if (/bash|exec_command|shell|command_execution/.test(t)) return "bash";
  if (/glob|ls_dir|list_dir|find/.test(t)) return "glob";
  if (/grep|search/.test(t)) return "grep";
  if (/spawn|task|subagent/.test(t)) return "spawn";
  return t;
}

/** Everything observable from one agent run. Produced by the runner. */
export interface RunTrace {
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>;
  /** File paths changed/created relative to fixture root. */
  filesChanged: string[];
  /** Full command strings that were executed (from bash-like tool calls). */
  commandsRun: string[];
  /** The agent's final text output. */
  output: string;
  /** Non-fatal problems encountered during the run (e.g. harness truncation). */
  warnings: string[];
}

export interface AssertionResult {
  kind: AssertionKind;
  /** What was being asserted (the expected value or pattern). */
  expected: string;
  pass: boolean;
  /** Human-readable explanation of what actually happened. */
  actual: string;
}

type AssertionKind =
  | "files_changed"
  | "commands_run"
  | "tool_calls"
  | "must_not"
  | "output_contains";

function partialMatch(haystacks: string[], needle: string): boolean {
  const n = needle.toLowerCase();
  return haystacks.some((h) => h.toLowerCase().includes(n));
}

export function evaluateAssertions(trace: RunTrace, expect: Expectations): AssertionResult[] {
  const results: AssertionResult[] = [];

  // files_changed
  for (const expected of expect.files_changed ?? []) {
    const pass = partialMatch(trace.filesChanged, expected);
    results.push({
      kind: "files_changed",
      expected,
      pass,
      actual: trace.filesChanged.length > 0 ? `changed: [${trace.filesChanged.join(", ")}]` : "no files changed",
    });
  }

  // commands_run
  for (const expected of expect.commands_run ?? []) {
    const pass = partialMatch(trace.commandsRun, expected);
    results.push({
      kind: "commands_run",
      expected,
      pass,
      actual: trace.commandsRun.length > 0 ? `ran: [${trace.commandsRun.join("; ")}]` : "no commands run",
    });
  }

  // tool_calls
  for (const expected of expect.tool_calls ?? []) {
    const called = trace.toolCalls.map((tc) => normalizeToolName(tc.tool));
    const pass = called.includes(normalizeToolName(expected));
    results.push({
      kind: "tool_calls",
      expected,
      pass,
      actual: called.length > 0 ? `called: [${called.join(", ")}]` : "no tool calls",
    });
  }

  // must_not — inverted lookups over the same observables
  const mn = expect.must_not ?? {};
  for (const forbidden of mn.files_changed ?? []) {
    const violated = partialMatch(trace.filesChanged, forbidden);
    results.push({
      kind: "must_not",
      expected: `files_changed does not include ${forbidden}`,
      pass: !violated,
      actual: violated ? `VIOLATED — ${forbidden} was changed` : `changed: [${trace.filesChanged.join(", ") || "none"}]`,
    });
  }
  for (const forbidden of mn.commands_run ?? []) {
    const violated = partialMatch(trace.commandsRun, forbidden);
    results.push({
      kind: "must_not",
      expected: `commands_run does not include ${forbidden}`,
      pass: !violated,
      actual: violated ? `VIOLATED — ran: ${forbidden}` : `ran: [${trace.commandsRun.join("; ") || "none"}]`,
    });
  }
  for (const forbidden of mn.tool_calls ?? []) {
    const violated = trace.toolCalls.map((tc) => normalizeToolName(tc.tool)).includes(normalizeToolName(forbidden));
    results.push({
      kind: "must_not",
      expected: `tool_calls does not include ${forbidden}`,
      pass: !violated,
      actual: violated ? `VIOLATED — called ${forbidden}` : "ok",
    });
  }

  // output_contains
  for (const expected of expect.output_contains ?? []) {
    const pass = trace.output.toLowerCase().includes(expected.toLowerCase());
    results.push({
      kind: "output_contains",
      expected,
      pass,
      actual: trace.output ? `output: "${trace.output.slice(0, 200)}"` : "(no output)",
    });
  }

  return results;
}

export function summarize(results: AssertionResult[]): { passed: number; failed: number } {
  const passed = results.filter((r) => r.pass).length;
  return { passed, failed: results.length - passed };
}
