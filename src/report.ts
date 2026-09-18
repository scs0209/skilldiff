// skilldiff v0.1 — behavior diff report formatting.
// Same text is used for CLI output and (later) the GitHub PR comment body.

import type { RunTrace, AssertionResult } from "./assertions.js";
import { summarize } from "./assertions.js";

export interface SideResult {
  label: string; // "old skill" | "new skill"
  trace: RunTrace;
  assertions: AssertionResult[];
}

function sideLines(side: SideResult): string[] {
  const lines: string[] = [];
  lines.push(`${side.label}: ${side.trace.toolCalls.length} tool calls, ${side.trace.filesChanged.length} file(s) changed, ${side.trace.commandsRun.length} command(s) run`);
  if (side.trace.filesChanged.length > 0) {
    lines.push(`  files: ${side.trace.filesChanged.join(", ")}`);
  }
  if (side.trace.commandsRun.length > 0) {
    lines.push(`  commands: ${side.trace.commandsRun.join(" | ")}`);
  }
  if (side.trace.warnings.length > 0) {
    lines.push(`  warnings: ${side.trace.warnings.join("; ")}`);
  }
  return lines;
}

export function formatReport(scenarioName: string, sides: SideResult[]): string {
  const out: string[] = [];
  out.push(`skilldiff behavior report — ${scenarioName}`);
  out.push("");
  for (const side of sides) {
    out.push(...sideLines(side));
  }

  // Assertion results are expected to be identical for old and new (the scenario
  // describes desired behavior); the interesting signal is WHICH side fails.
  out.push("");
  out.push("Assertions:");
  const newSide = sides[sides.length - 1];
  for (const r of newSide.assertions) {
    const mark = r.pass ? "✓" : "✗";
    out.push(`  ${mark} [${r.kind}] ${r.expected}`);
    if (!r.pass) {
      out.push(`      actual (new): ${r.actual}`);
      const oldSide = sides[0];
      if (oldSide && oldSide !== newSide) {
        const oldMatching = oldSide.assertions.find((o) => o.kind === r.kind && o.expected === r.expected);
        if (oldMatching && !oldMatching.pass) {
          out.push(`      note: old skill also failed this assertion`);
        } else if (oldMatching?.pass) {
          out.push(`      actual (old): ${oldMatching.actual}`);
          out.push(`      note: this is a REGRESSION — old skill passed, new skill fails`);
        }
      }
    }
  }

  const { passed, failed } = summarize(newSide.assertions);
  out.push("");
  out.push(`Result (new skill): ${passed} passed, ${failed} failed`);
  return out.join("\n");
}
