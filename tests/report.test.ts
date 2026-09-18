// Unit tests for the report formatter.

import { describe, it, expect } from "vitest";
import { formatReport, type SideResult } from "../src/report.js";
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
    expect(report).toContain("skilldiff behavior report — notes-helper");
    expect(report).toContain("old skill: ");
    expect(report).toContain("new skill: ");
    expect(report).toContain("Result (new skill): 2 passed, 0 failed");
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
    expect(report).toMatch(/✗ \[commands_run\] npm test/);
    expect(report).toContain("REGRESSION");
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
    expect(report).toContain("old skill also failed");
  });
});
