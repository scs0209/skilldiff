// skilldiff v0.1 — scenario types + YAML loader.
// Scenario YAML describes: which skill files, which fixture repo, the prompt to run,
// and the 5 assertion kinds (files_changed, commands_run, tool_calls, must_not, output_contains).

import { parse } from "yaml";
import { readFile } from "node:fs/promises";

/** The 5 assertion kinds, per design-decisions.md. */
export type AssertionKind =
  | "files_changed"
  | "commands_run"
  | "tool_calls"
  | "must_not"
  | "output_contains";

export interface Expectations {
  /** Paths that must have been changed/created relative to fixture root. Partial match. */
  files_changed?: string[];
  /** Commands that must have been run. Partial match against full command strings. */
  commands_run?: string[];
  /** Tool names that must have been invoked. Partial match against normalized tool names. */
  tool_calls?: string[];
  /** Things that must NOT have happened. Same shape as the positive assertions. */
  must_not?: {
    files_changed?: string[];
    commands_run?: string[];
    tool_calls?: string[];
  };
  /** Substring(s) that must appear in the agent's final text output. */
  output_contains?: string[];
}

export interface Scenario {
  name: string;
  /** Skill paths (repo-relative) whose behavior is under test. */
  skillPaths: string[];
  /** Path to the fixture repo (absolute or relative to the scenario file). */
  fixture: string;
  /** Prompt given to the agent. */
  prompt: string;
  /** Harness to use: freebuff | cursor-agent | codex | claude-code. Default: auto-detect. */
  harness?: string;
  /** Per-scenario turn cap. */
  maxTurns?: number;
  expect: Expectations;
}

function expectStringArray(value: unknown, field: string, scenarioName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error(`${scenarioName}: ${field} must be a list of strings`);
  }
  return value as string[];
}

/** Parse and validate a scenario YAML string. */
export function parseScenarioYaml(yamlText: string, sourceName = "(inline)"): Scenario {
  let raw: Record<string, unknown>;
  try {
    raw = parse(yamlText) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`${sourceName}: invalid YAML — ${(err as Error).message}`);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error(`${sourceName}: scenario must be a YAML mapping`);
  }

  const name = typeof raw.name === "string" ? raw.name : "";
  if (!name) throw new Error(`${sourceName}: missing required field 'name'`);

  const prompt = typeof raw.prompt === "string" ? raw.prompt : "";
  if (!prompt) throw new Error(`${sourceName}: missing required field 'prompt'`);

  const fixture = typeof raw.fixture === "string" ? raw.fixture : "";
  if (!fixture) throw new Error(`${sourceName}: missing required field 'fixture'`);

  const skillPaths = expectStringArray(raw.skillPaths, "skillPaths", name) ?? [];
  if (skillPaths.length === 0) {
    throw new Error(`${sourceName}: 'skillPaths' must list at least one skill file under test`);
  }

  const harness = typeof raw.harness === "string" ? raw.harness : undefined;
  if (harness && !["freebuff", "cursor-agent", "codex", "claude-code"].includes(harness)) {
    throw new Error(
      `${sourceName}: unknown harness '${harness}' (expected freebuff | cursor-agent | codex | claude-code)`,
    );
  }

  const maxTurns =
    typeof raw.maxTurns === "number" && Number.isInteger(raw.maxTurns) && raw.maxTurns > 0
      ? raw.maxTurns
      : undefined;

  const expectRaw = (raw.expect ?? {}) as Record<string, unknown>;
  if (typeof raw.expect !== "object" || raw.expect === null) {
    throw new Error(`${sourceName}: 'expect' must be a mapping`);
  }

  const mustNotRaw = (expectRaw.must_not ?? {}) as Record<string, unknown>;
  if (typeof expectRaw.must_not !== "undefined" && (typeof expectRaw.must_not !== "object" || expectRaw.must_not === null)) {
    throw new Error(`${name}: expect.must_not must be a mapping`);
  }

  const expect: Expectations = {
    files_changed: expectStringArray(expectRaw.files_changed, "expect.files_changed", name),
    commands_run: expectStringArray(expectRaw.commands_run, "expect.commands_run", name),
    tool_calls: expectStringArray(expectRaw.tool_calls, "expect.tool_calls", name),
    must_not: {
      files_changed: expectStringArray(mustNotRaw.files_changed, "expect.must_not.files_changed", name),
      commands_run: expectStringArray(mustNotRaw.commands_run, "expect.must_not.commands_run", name),
      tool_calls: expectStringArray(mustNotRaw.tool_calls, "expect.must_not.tool_calls", name),
    },
    output_contains: expectStringArray(expectRaw.output_contains, "expect.output_contains", name),
  };

  return { name, skillPaths, fixture, prompt, harness, maxTurns, expect };
}

/** Load a scenario from a YAML file path. */
export async function loadScenario(path: string): Promise<Scenario> {
  const text = await readFile(path, "utf8");
  return parseScenarioYaml(text, path);
}
