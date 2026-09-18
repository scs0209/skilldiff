// skilldiff v0.1 — scenario runner skeleton.
// Two modes:
//   recorded: replays a captured trace JSON (deterministic, for CI without quota)
//   freebuff: live run via the Freebuff/Codebuff harness (scripts/freebuff-adapter.ts)

import { readFile, cp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Scenario } from "./scenario.js";
import { fetchSkillVersion, cleanupSkillVersion } from "./baseline.js";
import { buildTrace } from "./trace-utils.js";
import { evaluateAssertions, type RunTrace, type AssertionResult } from "./assertions.js";
import type { SideResult } from "./report.js";
import { formatReport } from "./report.js";

/** A recorded trace fixture — captured once from a live run, replayed deterministically. */
export interface RecordedTrace {
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>;
  output?: string;
  filesChanged?: string[];
  warnings?: string[];
}

export async function loadRecordedTrace(path: string): Promise<RecordedTrace> {
  const raw = JSON.parse(await readFile(path, "utf8")) as RecordedTrace;
  if (!Array.isArray(raw.toolCalls)) {
    throw new Error(`${path}: recorded trace must have a toolCalls array`);
  }
  return raw;
}

function runRecordedSide(label: string, trace: RecordedTrace, scenario: Scenario, fixtureRoot: string): SideResult {
  const runTrace: RunTrace = buildTrace({
    toolCalls: trace.toolCalls,
    output: trace.output ?? "",
    fixtureRoot,
    filesChanged: trace.filesChanged,
    warnings: trace.warnings,
  });
  return { label, trace: runTrace, assertions: evaluateAssertions(runTrace, scenario.expect) };
}

async function runFreebuffSide(
  label: string,
  scenario: Scenario,
  fixtureRoot: string,
  skillVersionDir?: string,
): Promise<SideResult> {
  // Dynamic import: the SDK is only needed for live runs.
  const { runFreebuffHarness } = await import("../scripts/freebuff-adapter.js");

  // If a skill version dir is given, copy those files INTO the fixture so the
  // agent reads the version under test from the usual .claude/skills location.
  if (skillVersionDir) {
    for (const skillPath of scenario.skillPaths) {
      await cp(join(skillVersionDir, skillPath), join(fixtureRoot, skillPath), { force: true });
    }
  }

  // Also pass them inline for harnesses that support direct skill injection.
  const skillFiles = skillVersionDir
    ? await Promise.all(
        scenario.skillPaths.map(async (p) => ({
          name: p.split("/").slice(-2, -1)[0] ?? "skill",
          path: join(skillVersionDir, p),
        })),
      )
    : undefined;

  const { traces, error } = await runFreebuffHarness({
    cwd: fixtureRoot,
    prompt: scenario.prompt,
    maxTurns: scenario.maxTurns,
    skillFiles,
  });

  const warnings: string[] = [];
  if (error) warnings.push(`harness error: ${error}`);

  const output = traces
    .filter((t) => t.tool === "message" || t.tool === "text")
    .map((t) => String((t.input as { text?: string } | undefined)?.text ?? ""))
    .join("\n");

  const runTrace = buildTrace({
    toolCalls: traces,
    output,
    fixtureRoot,
    warnings,
  });
  return { label, trace: runTrace, assertions: evaluateAssertions(runTrace, scenario.expect) };
}

export interface RunOptions {
  /** Recorded trace for the old skill (required in recorded mode). */
  oldTrace?: string;
  /** Recorded trace for the new skill (optional; defaults to old-only mode). */
  newTrace?: string;
  /** Force live mode even if recorded traces are given. */
  live?: boolean;
  /** Git ref to fetch the OLD skill version from (e.g. base branch). Enables the full pipeline. */
  base?: string;
}

export interface RunResult {
  report: string;
  passed: boolean;
  sides: SideResult[];
}

export async function runScenario(scenario: Scenario, opts: RunOptions): Promise<RunResult> {
  const fixtureRoot = resolve(scenario.fixture);

  if (!opts.live && opts.oldTrace) {
    // Deterministic recorded mode
    const old = await loadRecordedTrace(opts.oldTrace);
    const sides: SideResult[] = [runRecordedSide("old skill", old, scenario, fixtureRoot)];
    if (opts.newTrace) {
      const neu = await loadRecordedTrace(opts.newTrace);
      sides.push(runRecordedSide("new skill", neu, scenario, fixtureRoot));
    }
    const report = formatReport(scenario.name, sides);
    const lastAssertions = sides[sides.length - 1].assertions;
    return { report, passed: lastAssertions.every((a) => a.pass), sides };
  }

  // Live mode — currently Freebuff only; other harnesses come online in later v0.1 cuts.
  const harness = scenario.harness ?? "freebuff";
  if (harness !== "freebuff") {
    throw new Error(`live harness '${harness}' not wired yet — use recorded mode or harness: freebuff`);
  }

  if (opts.base) {
    // Full pipeline: fetch old skill from base ref -> snapshot the new skill's
    // current fixture files -> run old, restore, run new, diff.
    const oldVersion = await fetchSkillVersion(fixtureRoot, opts.base, scenario.skillPaths);

    // Snapshot current (new) skill files so we can restore after the old-skill run.
    const snapshotDir = await mkdtemp(join(tmpdir(), "skilldiff-current-"));
    for (const skillPath of scenario.skillPaths) {
      await cp(join(fixtureRoot, skillPath), join(snapshotDir, skillPath), { force: true });
    }

    try {
      const oldSide = await runFreebuffSide("old skill", scenario, fixtureRoot, oldVersion.dir);

      // Restore new skill files before the new run.
      for (const skillPath of scenario.skillPaths) {
        await cp(join(snapshotDir, skillPath), join(fixtureRoot, skillPath), { force: true });
      }
      const newSide = await runFreebuffSide("new skill", scenario, fixtureRoot);

      const report = formatReport(scenario.name, [oldSide, newSide]);
      return { report, passed: newSide.assertions.every((a) => a.pass), sides: [oldSide, newSide] };
    } finally {
      // Restore new skill files even on failure so the fixture isn't left with old versions.
      for (const skillPath of scenario.skillPaths) {
        await cp(join(snapshotDir, skillPath), join(fixtureRoot, skillPath), { force: true }).catch(() => {});
      }
      await cleanupSkillVersion(oldVersion);
      await rm(snapshotDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const newSide = await runFreebuffSide("new skill", scenario, fixtureRoot);
  const report = formatReport(scenario.name, [newSide]);
  return { report, passed: newSide.assertions.every((a) => a.pass), sides: [newSide] };
}
