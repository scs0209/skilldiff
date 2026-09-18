// Unit tests for the 5 assertion kinds.

import { describe, it, expect } from "vitest";
import { evaluateAssertions, normalizeToolName, type RunTrace } from "../src/assertions.js";
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

describe("normalizeToolName", () => {
  it("maps harness-specific names to canonical tools", () => {
    expect(normalizeToolName("Read")).toBe("read");
    expect(normalizeToolName("view_file")).toBe("read");
    expect(normalizeToolName("Write")).toBe("write");
    expect(normalizeToolName("str_replace_editor")).toBe("write");
    expect(normalizeToolName("exec_command")).toBe("bash");
    expect(normalizeToolName("Bash")).toBe("bash");
  });
});

describe("files_changed", () => {
  it("passes on partial path match", () => {
    const trace = makeTrace({ filesChanged: ["src/deep/NOTES.md"] });
    const results = evaluateAssertions(trace, { files_changed: ["NOTES.md"] });
    expect(results[0].pass).toBe(true);
  });

  it("fails when nothing changed", () => {
    const results = evaluateAssertions(makeTrace(), { files_changed: ["NOTES.md"] });
    expect(results[0].pass).toBe(false);
    expect(results[0].actual).toMatch(/no files changed/);
  });
});

describe("commands_run", () => {
  it("passes on substring match against full command", () => {
    const trace = makeTrace({ commandsRun: ["npm test -- --coverage"] });
    const results = evaluateAssertions(trace, { commands_run: ["npm test"] });
    expect(results[0].pass).toBe(true);
  });

  it("is case-insensitive", () => {
    const trace = makeTrace({ commandsRun: ["NPM RUN BUILD"] });
    const results = evaluateAssertions(trace, { commands_run: ["npm run build"] });
    expect(results[0].pass).toBe(true);
  });
});

describe("tool_calls", () => {
  it("matches after normalization", () => {
    const trace = makeTrace({
      toolCalls: [
        { tool: "view_file", input: {} },
        { tool: "str_replace_editor", input: {} },
      ],
    });
    const results = evaluateAssertions(trace, { tool_calls: ["read", "write"] });
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it("fails when the tool was never called", () => {
    const results = evaluateAssertions(makeTrace(), { tool_calls: ["bash"] });
    expect(results[0].pass).toBe(false);
  });
});

describe("must_not", () => {
  it("passes when the forbidden thing did not happen", () => {
    const results = evaluateAssertions(makeTrace(), {
      must_not: { commands_run: ["rm -rf"], files_changed: ["PLAN.md"], tool_calls: ["bash"] },
    });
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it("fails (violated) when the forbidden thing happened", () => {
    const trace = makeTrace({ filesChanged: ["PLAN.md"] });
    const results = evaluateAssertions(trace, {
      must_not: { files_changed: ["PLAN.md"] },
    });
    expect(results[0].pass).toBe(false);
    expect(results[0].actual).toMatch(/VIOLATED/);
  });
});

describe("output_contains", () => {
  it("passes on case-insensitive substring", () => {
    const trace = makeTrace({ output: "SPIKE RAN OK" });
    const results = evaluateAssertions(trace, { output_contains: ["spike ran ok"] });
    expect(results[0].pass).toBe(true);
  });

  it("fails on empty output", () => {
    const results = evaluateAssertions(makeTrace(), { output_contains: ["anything"] });
    expect(results[0].pass).toBe(false);
  });
});

describe("evaluateAssertions — empty expectations", () => {
  it("returns no assertions for an empty expect block", () => {
    const results = evaluateAssertions(makeTrace(), {} as Expectations);
    expect(results).toHaveLength(0);
  });
});
