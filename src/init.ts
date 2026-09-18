// skilldiff v0.1 — `skilldiff init`: scan the repo for skills and emit
// starter scenario YAMLs so users get value in under a minute.

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { discoverSkills, buildStarterScenario, type DiscoveredSkill } from "./discover.js";

function scenarioToYaml(scenario: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`name: ${scenario.name}`);
  lines.push(`skillPaths:`);
  for (const p of scenario.skillPaths as string[]) lines.push(`  - ${p}`);
  lines.push(`fixture: ${scenario.fixture}`);
  lines.push(`prompt: >-`);
  lines.push(`  ${(scenario.prompt as string).replace(/\n+/g, " ")}`);
  lines.push(`expect:`);
  const expect = scenario.expect as Record<string, unknown>;
  lines.push(`  tool_calls:`);
  for (const t of expect.tool_calls as string[]) lines.push(`    - ${t}`);
  return lines.join("\n") + "\n";
}

export async function runInit(repoRoot: string, outDir = "skilldiff"): Promise<{ created: string[]; skills: DiscoveredSkill[] }> {
  const skills = await discoverSkills(repoRoot);
  if (skills.length === 0) {
    return { created: [], skills };
  }

  const absOutDir = resolve(outDir); // resolve against cwd, NOT repoRoot
  await mkdir(absOutDir, { recursive: true });
  const created: string[] = [];
  for (const skill of skills) {
    const file = join(absOutDir, `${skill.name}.scenario.yaml`);
    const yaml = scenarioToYaml(buildStarterScenario(skill));
    await writeFile(file, yaml);
    created.push(file);
  }
  return { created, skills };
}

export function printInitSummary(result: { created: string[]; skills: DiscoveredSkill[] }): void {
  if (result.skills.length === 0) {
    console.log("No SKILL.md files found in conventional locations:");
    console.log("  .claude/skills/, skills/, .agents/skills/");
    console.log("\nTo test a skill elsewhere, write a scenario manually:");
    console.log("  https://github.com/scs0209/skilldiff#quickstart");
    return;
  }

  console.log(`Found ${result.skills.length} skill(s):\n`);
  for (const skill of result.skills) {
    console.log(`  ${skill.name}${skill.description ? ` — ${skill.description}` : ""}`);
    console.log(`    ${skill.path}`);
  }

  console.log(`\nCreated starter scenarios:`);
  for (const file of result.created) {
    console.log(`  ${file}`);
  }

  console.log(`
Next steps:
  1. Point 'fixture' in each scenario at a small repo the skill can safely
     operate on (a temp copy of a real project works well).
  2. Strengthen 'expect' once you've seen the skill's real behavior — start
     with what it MUST do, then add must_not for what it must NEVER do.
  3. Try a live run:
       skilldiff run <scenario>.yaml --live
  4. Capture traces for CI (recorded mode):
       skilldiff run <scenario>.yaml --live --save-trace traces/
`);
}
