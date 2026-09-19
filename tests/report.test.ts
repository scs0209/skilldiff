// Unit tests for the report formatter.

import { describe, it, expect } from "vitest";
import {
  formatReport,
  aggregateBatch,
  detectBatchRegressions,
  formatBatchReport,
  type SideResult,
} from "../src/report.js";
import { evaluateAssertions, type RunTrace } from "../src/assertions.js";
import type { Expectations } from "../src/scenario.js";

function makeTrace(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    toolCalls: [],
    filesChanged: [],
    commandsRun: [],
    output: "",
    warnings: [],
    ...overrides,
  };
}

const expectBoth: Expectations = {
  files_changed: ["NOTES.md"],
  must_not: { commands_run: ["rm -rf"] },
};

describe("formatReport", () => {
  it("renders both sides with summary", () => {
    const oldSide: SideResult = {
      label: "old skill",
      trace: makeTrace({ filesChanged: ["NOTES.md"], commandsRun: ["npm test"] }),
      assertions: evaluateAssertions(
        makeTrace({ filesChanged: ["NOTES.md"], commandsRun: ["npm test"] }),
        expectBoth,
      ),
    };
    const newSide: SideResult = {
      label: "new skill",
      trace: makeTrace({ filesChanged: ["NOTES.md"] }),
      assertions: evaluateAssertions(makeTrace({ filesChanged: ["NOTES.md"] }), expectBoth),
    };
    // new side fails commands_run? No — commands_run isn't in expectations; both pass.
    const report = formatReport("notes-helper", [oldSide, newSide]);
    expect(report).toContain("skilldiff behavior report — `notes-helper`");
    expect(report).toContain("**old skill** —");
    expect(report).toContain("**new skill** —");
    expect(report).toContain("| `files_changed` | NOTES.md | ✓ pass | ✓ pass |");
    expect(report).toContain("Result (new skill): ✅ **no behavior regressions** — 2 passed, 0 failed");
  });

  it("flags a regression when old passed and new fails", () => {
    const expectRm = { commands_run: ["npm test"] } as Expectations;
    const oldSide: SideResult = {
      label: "old skill",
      trace: makeTrace({ commandsRun: ["npm test"] }),
      assertions: evaluateAssertions(makeTrace({ commandsRun: ["npm test"] }), expectRm),
    };
    const newSide: SideResult = {
      label: "new skill",
      trace: makeTrace(),
      assertions: evaluateAssertions(makeTrace(), expectRm),
    };
    const report = formatReport("regression-case", [oldSide, newSide]);
    expect(report).toContain("| `commands_run` | npm test | ✓ pass | ✗ **REGRESSION** |");
    expect(report).toContain("old passed ·");
  });

  it("notes when old also failed (not a regression, pre-existing)", () => {
    const expectRm = { commands_run: ["npm test"] } as Expectations;
    const oldSide: SideResult = {
      label: "old skill",
      trace: makeTrace(),
      assertions: evaluateAssertions(makeTrace(), expectRm),
    };
    const newSide: SideResult = {
      label: "new skill",
      trace: makeTrace(),
      assertions: evaluateAssertions(makeTrace(), expectRm),
    };
    const report = formatReport("preexisting-case", [oldSide, newSide]);
    expect(report).toContain("old also failed (pre-existing)");
  });
});

// A side with a must_not that fires on the given number of runs.
function batchedSide(label: string, n: number, todoViolations: number): SideResult[] {
  const expectTodo: Expectations = { must_not: { files_changed: ["TODO.md"] } };
  const sides: SideResult[] = [];
  for (let i = 0; i < n; i++) {
    const hitsTodo = i < todoViolations;
    const trace = makeTrace({ filesChanged: hitsTodo ? ["TODO.md"] : ["NOTES.md"] });
    sides.push({ label, trace, assertions: evaluateAssertions(trace, expectTodo) });
  }
  return sides;
}

describe("batch aggregation", () => {
  it("aggregates failure counts into an empirical rate", () => {
    const agg = aggregateBatch(batchedSide("new skill", 10, 3));
    expect(agg.n).toBe(10);
    expect(agg.assertions[0].kind).toBe("must_not");
    expect(agg.assertions[0].fails).toBe(3);
    expect(agg.assertions[0].rate).toBeCloseTo(0.3);
  });

  it("flags a new failure rate above tolerance as a regression", () => {
    const oldAgg = aggregateBatch(batchedSide("old skill", 10, 0));
    const newAgg = aggregateBatch(batchedSide("new skill", 10, 3));
    const regs = detectBatchRegressions(oldAgg, newAgg);
    expect(regs).toHaveLength(1);
    expect(regs[0].kind).toBe("must_not");
    expect(regs[0].blocked).toBe(true);
    expect(regs[0].oldRate).toBe(0);
    expect(regs[0].newRate).toBeCloseTo(0.3);
  });

  it("does not flag noise-level variance (1/10 = 0.1, within tolerance)", () => {
    const oldAgg = aggregateBatch(batchedSide("old skill", 10, 0));
    const newAgg = aggregateBatch(batchedSide("new skill", 10, 1));
    const regs = detectBatchRegressions(oldAgg, newAgg);
    expect(regs).toHaveLength(0);
  });

  it("does not flag when baseline already fails at the same rate (pre-existing)", () => {
    const oldAgg = aggregateBatch(batchedSide("old skill", 10, 3));
    const newAgg = aggregateBatch(batchedSide("new skill", 10, 3));
    const regs = detectBatchRegressions(oldAgg, newAgg);
    expect(regs).toHaveLength(0);
  });

  it("renders the batch report with rates and verdict", () => {
    const oldAgg = aggregateBatch(batchedSide("old skill", 10, 0));
    const newAgg = aggregateBatch(batchedSide("new skill", 10, 3));
    const regs = detectBatchRegressions(oldAgg, newAgg);
    const report = formatBatchReport("batch-case", oldAgg, newAgg, regs);
    expect(report).toContain("(batch)");
    expect(report).toContain("**baseline** old skill × 10 runs");
    expect(report).toContain("| `must_not` | files_changed does not include TODO.md | 0/10 | 3/10 | ✗ **BLOCK** |");
    expect(report).toContain("Result: ❌ **1 assertion(s) regressed** across 10 candidate runs");
  });
});
