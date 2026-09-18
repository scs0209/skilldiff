// Unit tests for the scenario YAML loader.

import { describe, it, expect } from "vitest";
import { parseScenarioYaml } from "../src/scenario.js";

const validYaml = `
name: notes-helper
skillPaths:
  - .claude/skills/notes-helper/SKILL.md
fixture: ./fixtures/notes-repo
prompt: Read NOTES.md and follow the instructions in it.
expect:
  files_changed:
    - NOTES.md
  tool_calls:
    - read
    - write
  must_not:
    commands_run:
      - rm -rf
  output_contains:
    - SPIKE RAN OK
`;

describe("parseScenarioYaml", () => {
  it("parses a full valid scenario", () => {
    const s = parseScenarioYaml(validYaml);
    expect(s.name).toBe("notes-helper");
    expect(s.skillPaths).toEqual([".claude/skills/notes-helper/SKILL.md"]);
    expect(s.fixture).toBe("./fixtures/notes-repo");
    expect(s.expect.files_changed).toEqual(["NOTES.md"]);
    expect(s.expect.tool_calls).toEqual(["read", "write"]);
    expect(s.expect.must_not?.commands_run).toEqual(["rm -rf"]);
    expect(s.expect.output_contains).toEqual(["SPIKE RAN OK"]);
  });

  it("throws on missing name", () => {
    const yaml = validYaml.replace("name: notes-helper\n", "");
    expect(() => parseScenarioYaml(yaml)).toThrow(/missing required field 'name'/);
  });

  it("throws on missing prompt", () => {
    const yaml = validYaml.replace(/prompt: .*\n/, "");
    expect(() => parseScenarioYaml(yaml)).toThrow(/missing required field 'prompt'/);
  });

  it("throws on missing fixture", () => {
    const yaml = validYaml.replace(/fixture: .*\n/, "");
    expect(() => parseScenarioYaml(yaml)).toThrow(/missing required field 'fixture'/);
  });

  it("throws when skillPaths is empty", () => {
    const yaml = validYaml.replace(/skillPaths:\n  - .*\n/, "skillPaths: []\n");
    expect(() => parseScenarioYaml(yaml)).toThrow(/at least one skill file/);
  });

  it("throws on unknown harness", () => {
    const yaml = validYaml + "\nharness: skynet\n";
    expect(() => parseScenarioYaml(yaml)).toThrow(/unknown harness/);
  });

  it("accepts a known harness and maxTurns", () => {
    const yaml = validYaml + "\nharness: freebuff\nmaxTurns: 10\n";
    const s = parseScenarioYaml(yaml);
    expect(s.harness).toBe("freebuff");
    expect(s.maxTurns).toBe(10);
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => parseScenarioYaml("name: [unclosed", "bad.yaml")).toThrow(/invalid YAML/);
  });

  it("throws when files_changed is not a list of strings", () => {
    const yaml = validYaml.replace("    - NOTES.md", "    - 42");
    expect(() => parseScenarioYaml(yaml)).toThrow(/must be a list of strings/);
  });
});
