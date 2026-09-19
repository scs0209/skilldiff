// skilldiff v0.1 — behavior diff report formatting.
// Same text is used for CLI output and the GitHub PR comment body (Markdown).

import type { RunTrace, AssertionResult } from "./assertions.js";
import { summarize } from "./assertions.js";

export interface SideResult {
  label: string; // "old skill" | "new skill"
  trace: RunTrace;
  assertions: AssertionResult[];
}

/**
 * Turn a failed assertion into something an author can act on: what changed
 * between the two runs, the likely cause, and the next move.
 */
function adviceFor(
  r: AssertionResult,
  oldSide: SideResult | undefined,
  newSide: SideResult,
): string[] {
  const lines: string[] = [];
  const oldTrace = oldSide?.trace;
  const oldFiles = oldTrace?.filesChanged ?? [];
  const newFiles = newSide.trace.filesChanged;
  const oldTools = (oldTrace?.toolCalls ?? []).map((t) => t.tool.toLowerCase());
  const newTools = newSide.trace.toolCalls.map((t) => t.tool.toLowerCase());

  if (r.kind === "must_not") {
    const m = r.expected.match(/^(\S+) does not include (.+)$/);
    const channel = m?.[1] ?? "files_changed";
    const thing = m?.[2] ?? r.expected;
    if (channel === "files_changed") {
      const creating = newSide.trace.toolCalls.find(
        (t) => /write|create|edit/.test(t.tool.toLowerCase()) && JSON.stringify(t.input ?? {}).toLowerCase().includes(thing.toLowerCase()),
      );
      lines.push(
        `what happened: the old skill never touched \`${thing}\`; the new skill ${creating ? `created/modified it via \`${creating.tool}\`` : "changed it"}.`,
      );
      lines.push(
        `likely cause: an added instruction in SKILL.md now nudges the agent to produce \`${thing}\` (\u201Csummarize what you did\u201D-style lines are common culprits).`,
      );
      lines.push(
        `fix: add an explicit negative constraint to SKILL.md (e.g. \u201Cdo NOT create any new files\u201D) or scope the instruction to \`${oldFiles[0] ?? "the target file"}\` only — then re-run.`,
      );
    } else if (channel === "commands_run") {
      lines.push(`what happened: the new skill ran \`${thing}\`; the old skill never did.`);
      lines.push(`fix: remove the step that triggers it, or gate it behind a flag the scenario can set.`);
    } else {
      lines.push(`what happened: the new skill used the \`${thing}\` tool where the old one did not.`);
      lines.push(`fix: tighten the instruction that invites that tool, or add it to the scenario's allowlist if it's intended.`);
    }
    return lines;
  }

  if (r.kind === "files_changed") {
    lines.push(
      `what happened: expected \`${r.expected}\` to be changed. old run touched [${oldFiles.join(", ") || "none"}], new run touched [${newFiles.join(", ") || "none"}].`,
    );
    lines.push(
      newFiles.length === 0
        ? `likely cause: the edited instruction no longer triggers any action — check for wording that softened the directive.`
        : `likely cause: the agent acted on a different file — check whether the instruction's target path still matches the fixture.`,
    );
    lines.push(`fix: make the target explicit in SKILL.md (full path), or update the scenario if the move is intentional.`);
    return lines;
  }

  if (r.kind === "tool_calls") {
    const dropped = oldTools.filter((t) => !newTools.includes(t));
    const added = newTools.filter((t) => !oldTools.includes(t));
    lines.push(
      `what happened: expected a \`${r.expected}\` call. tool sequence changed: [${oldTools.join(", ") || "none"}] \u2192 [${newTools.join(", ") || "none"}].`,
    );
    if (dropped.length) lines.push(`likely cause: the new instruction made an earlier step skip the \`${r.expected}\` step${added.length ? ` (new tools appeared: ${added.join(", ")})` : ""}.`);
    else lines.push(`likely cause: harness variance — a single run is a sample; try \`--repeat 10\` before treating this as a regression.`);
    lines.push(`fix: re-anchor the instruction so the \`${r.expected}\` step is unconditional, or accept the new flow and update the scenario.`);
    return lines;
  }

  if (r.kind === "output_contains") {
    lines.push(`what happened: \u201C${r.expected}\u201D no longer appears in the final output.`);
    lines.push(`likely cause: the edit changed the agent's completion message, not its actions.`);
    lines.push(`fix: loosen the assertion to a stable substring, or instruct the agent to keep the original closing phrase.`);
    return lines;
  }

  lines.push(`what happened: ${r.actual}`);
  return lines;
}

function sideLines(side: SideResult): string[] {
  const lines: string[] = [];
  lines.push(`**${side.label}** — ${side.trace.toolCalls.length} tool calls · ${side.trace.filesChanged.length} file(s) · ${side.trace.commandsRun.length} command(s)`);
  if (side.trace.filesChanged.length > 0) {
    lines.push(`  files: \`${side.trace.filesChanged.join("`, `")}\``);
  }
  if (side.trace.commandsRun.length > 0) {
    lines.push(`  commands: \`${side.trace.commandsRun.join("`, `")}\``);
  }
  if (side.trace.warnings.length > 0) {
    lines.push(`  ⚠ warnings: ${side.trace.warnings.join("; ")}`);
  }
  return lines;
}

/** 
 * Markdown rendering of the behavior report: a header, the two run summaries,
 * and the assertion ledger — one row per expectation, both sides graded, with
 * the old-passed/new-fails verdict named explicitly (not implied).
 */
export function formatReport(scenarioName: string, sides: SideResult[]): string {
  const oldSide = sides[0];
  const newSide = sides[sides.length - 1];
  const out: string[] = [];

  out.push(`### skilldiff behavior report — \`${scenarioName}\``);
  out.push("");
  out.push(">");
  out.push("> *Text diff says what changed. This says what the agent will do differently.*");
  out.push(">");
  for (const side of sides) {
    for (const line of sideLines(side)) {
      out.push(`> ${line}`);
    }
  }
  out.push("");

  out.push("| assertion | expectation | baseline | candidate |");
  out.push("|---|---|---|---|");
  for (const r of newSide.assertions) {
    const o = oldSide.assertions.find((x) => x.kind === r.kind && x.expected === r.expected);
    const oldCell = o ? (o.pass ? "✓ pass" : "✗ fail") : "n/a";
    let newCell: string;
    let note = "";
    if (r.pass) {
      newCell = "✓ pass";
    } else if (o?.pass) {
      newCell = "✗ **REGRESSION**";
      note = ` old passed · ${r.actual}`;
    } else {
      newCell = "✗ fail";
      note = ` old also failed (pre-existing) · ${r.actual}`;
    }
    out.push(`| \`${r.kind}\` | ${r.expected} | ${oldCell} | ${newCell} |${note}`);
  }
  out.push("");

  const failures = newSide.assertions.filter((r) => !r.pass);
  if (failures.length > 0) {
    out.push("#### What to fix");
    out.push("");
    for (const f of failures) {
      const isReg = oldSide.assertions.find((x) => x.kind === f.kind && x.expected === f.expected)?.pass;
      out.push(`<details open><summary><code>${f.kind}</code> — ${f.expected}${isReg ? " (REGRESSION)" : ""}</summary>`);
      out.push("");
      for (const line of adviceFor(f, oldSide, newSide)) out.push(`${line}  `);
      out.push("");
      out.push("</details>");
      out.push("");
    }
  }

  const { passed, failed } = summarize(newSide.assertions);
  const verdict = failed === 0 ? "✅ **no behavior regressions**" : `❌ **${failed} behavior regression${failed > 1 ? "s" : ""}**`;
  out.push(`Result (new skill): ${verdict} — ${passed} passed, ${failed} failed`);
  return out.join("\n");
}

// ─── Batch aggregation & regression detection ────────────────────────────────
// "single run is a sample": a one-shot baseline-vs-candidate diff compares two
// random draws from an unmapped distribution and quietly misses regressions that
// only fire with some probability. Repeating each side N times and comparing
// empirical failure rates surfaces tail-risk regressions that a single clean
// run would pass into main.

export interface BatchAssertion {
  kind: string;
  expected: string;
  fails: number;
  n: number;
  rate: number;
}

export interface BatchAgg {
  label: string;
  n: number;
  assertions: BatchAssertion[];
}

export interface BatchOptions {
  tolerance?: number; // min rate delta (candidate − baseline) to flag regression (default 0.1)
  floor?: number;     // absolute failure rate at which a flagged regression BLOCKS (default 0.2)
}

export interface BatchRegression {
  kind: string;
  expected: string;
  oldRate: number;
  newRate: number;
  blocked: boolean; // true → gate blocks; false → warn only
}

export function aggregateBatch(sides: SideResult[]): BatchAgg {
  const n = sides.length;
  const map = new Map<string, { kind: string; expected: string; fails: number }>();
  for (const s of sides) {
    for (const r of s.assertions) {
      const key = `${r.kind}\u0000${r.expected}`;
      const e = map.get(key) ?? { kind: r.kind, expected: r.expected, fails: 0 };
      if (!r.pass) e.fails++;
      map.set(key, e);
    }
  }
  const assertions = [...map.values()]
    .map((a) => ({ ...a, n, rate: n > 0 ? a.fails / n : 0 }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.expected.localeCompare(b.expected));
  return { label: sides[0]?.label ?? "(none)", n, assertions };
}

export function detectBatchRegressions(
  oldAgg: BatchAgg | null,
  newAgg: BatchAgg,
  opts: BatchOptions = {},
): BatchRegression[] {
  const tolerance = opts.tolerance ?? 0.1;
  const floor = opts.floor ?? 0.2;
  const oldMap = new Map((oldAgg?.assertions ?? []).map((a) => [`${a.kind}\u0000${a.expected}`, a]));
  const out: BatchRegression[] = [];
  for (const a of newAgg.assertions) {
    const oldRate = oldMap.get(`${a.kind}\u0000${a.expected}`)?.rate ?? 0;
    const delta = a.rate - oldRate;
    if (delta > tolerance) {
      out.push({
        kind: a.kind,
        expected: a.expected,
        oldRate,
        newRate: a.rate,
        blocked: a.rate >= floor,
      });
    }
  }
  return out;
}

export function formatBatchReport(
  scenarioName: string,
  oldAgg: BatchAgg | null,
  newAgg: BatchAgg,
  regressions: BatchRegression[],
  opts: BatchOptions = {},
): string {
  const tolerance = opts.tolerance ?? 0.1;
  const floor = opts.floor ?? 0.2;
  const lines: string[] = [];

  lines.push(`### skilldiff behavior report — \`${scenarioName}\` (batch)`);
  lines.push("");
  if (oldAgg) {
    lines.push(`> **baseline** ${oldAgg.label} × ${oldAgg.n} run${oldAgg.n > 1 ? "s" : ""} · **candidate** ${newAgg.label} × ${newAgg.n} run${newAgg.n > 1 ? "s" : ""}`);
  } else {
    lines.push(`> **runs** ${newAgg.label} × ${newAgg.n} (self-check)`);
  }
  lines.push(">");
  lines.push(`> gate: block ≥ ${Math.round(floor * 100)}% failure and exceeds baseline by > ${Math.round(tolerance * 100)} pts`);
  lines.push("");

  const fmt = (n: number, fails: number) => `${fails}/${n}`;
  const oldMap = new Map((oldAgg?.assertions ?? []).map((a) => [`${a.kind}\u0000${a.expected}`, a]));

  lines.push("| assertion | expectation | baseline | candidate | verdict |*");
  lines.push("|---|---|---|---|---|");
  for (const a of newAgg.assertions) {
    const o = oldMap.get(`${a.kind}\u0000${a.expected}`);
    const oldStr = o ? fmt(o.n, o.fails) : "n/a";
    const newStr = fmt(a.n, a.fails);
    const reg = regressions.find((r) => r.kind === a.kind && r.expected === a.expected);
    let cell = "✓ pass";
    if (reg) cell = reg.blocked ? "✗ **BLOCK**" : "⚠ **RISK**";
    lines.push(`| \`${a.kind}\` | ${a.expected} | ${oldStr} | ${newStr} | ${cell} |`);
  }

  const blocked = regressions.filter((r) => r.blocked).length;
  const warn = regressions.length - blocked;

  if (regressions.length > 0) {
    lines.push("#### What to fix");
    lines.push("");
    for (const reg of regressions) {
      const verdictLabel = reg.blocked ? "BLOCK" : "RISK";
      lines.push(`<details open><summary><code>${reg.kind}</code> — ${reg.expected} (${verdictLabel}: ${Math.round(reg.oldRate * 100)}% → ${Math.round(reg.newRate * 100)}%)</summary>`);   
      lines.push("");
      lines.push(`what happened: failure rate jumped ${Math.round(reg.oldRate * 100)}% → ${Math.round(reg.newRate * 100)}% across ${newAgg.n} candidate runs (a single run would likely have missed this).  `);
      lines.push(`fix: treat as probabilistic — the edited instruction now pushes the agent over the line in ~${Math.round(reg.newRate * 100)}% of runs. Add an explicit negative constraint or scope the instruction, then re-run with the same --repeat N to compare rates.  `);
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  lines.push("");
  if (blocked > 0) {
    lines.push(`Result: ❌ **${blocked} assertion(s) regressed** across ${newAgg.n} candidate run${newAgg.n > 1 ? "s" : ""} — merge blocked`);
  } else if (warn > 0) {
    lines.push(`Result: ⚠ **no blocked regressions** — ${warn} assertion(s) at regression risk across ${newAgg.n} candidate run${newAgg.n > 1 ? "s" : ""}`);
  } else {
    lines.push(`Result: ✅ **stable** — no assertion regressed across ${newAgg.n} candidate run${newAgg.n > 1 ? "s" : ""}`);
  }
  return lines.join("\n");
}
