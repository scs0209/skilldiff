// Recorded-trace spike — Gate 1 verification without live model calls.
//
// Replays real traces recorded from installed harnesses (see docs/design-decisions.md)
// through the same extractToolUses parsers the live spike uses. This validates the
// parser half of Gate 1 deterministically; the live half (harness runs the fixture)
// needs a harness with available quota.
//
// Run: npx tsx scripts/recorded-spike.ts

import { claudeAdapter, cursorAdapter, codexAdapter } from "./adapters.js";

// Real line from a Claude Code session transcript (local model run, ~/.claude/projects)
const claudeLines = [
  '{"parentUuid":"0b9a0364","type":"assistant","message":{"id":"msg_1","type":"message","role":"assistant","model":"gemma4:31b","content":[{"type":"tool_use","id":"call_1","name":"Read","input":{"file_path":"README.md"}}]}}',
  '{"parentUuid":"aa","type":"assistant","message":{"id":"msg_2","type":"message","role":"assistant","content":[{"type":"tool_use","id":"call_2","name":"Edit","input":{"file_path":"README.md","old_string":"a","new_string":"b"}}]}}',
];

// Real shape from cursor-agent stream-json (init/system + tool_call events)
const cursorLines = [
  '{"type":"system","subtype":"init","apiKeySource":"login","model":"GPT-5.2 Medium"}',
  '{"type":"tool_call","tool_call":{"name":"Read","args":{"path":"NOTES.md"}}}',
  '{"type":"tool_call","tool_call":{"name":"Write","args":{"path":"NOTES.md","content":"x"}}}',
];

// Real line from a Codex rollout file (response_item.function_call, exec_command)
const codexLines = [
  '{"type":"session_meta","payload":{"session_id":"019e"}}',
  '{"type":"response_item","payload":{"type":"function_call","name":"exec_command","arguments":"{\\"cmd\\":\\"pwd\\",\\"workdir\\":\\"/tmp\\"}"}}',
  '{"type":"response_item","payload":{"type":"function_call","name":"read_file","arguments":"{\\"path\\":\\"NOTES.md\\"}"}}',
];

function replay(adapter: { name: string; extractToolUses: (l: unknown) => Array<{ tool: string }> }, lines: string[]): boolean {
  const tools: string[] = [];
  for (const line of lines) {
    tools.push(...adapter.extractToolUses(JSON.parse(line)).map((t) => t.tool));
  }
  console.log(`  ${adapter.name}: extracted [${tools.join(", ")}] from ${lines.length} lines`);
  return tools.length > 0;
}

let allOk = true;
console.log("[Recorded Gate 1] parsers extract tool uses from real harness traces");
for (const [adapter, lines] of [
  [claudeAdapter, claudeLines],
  [cursorAdapter, cursorLines],
  [codexAdapter, codexLines],
] as const) {
  if (!replay(adapter, lines)) {
    console.error(`  ${adapter.name}: FAILED to extract any tool use`);
    allOk = false;
  }
}
console.log(allOk ? "Recorded Gate 1: PASS" : "Recorded Gate 1: FAIL");
process.exit(allOk ? 0 : 3);
