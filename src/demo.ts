// skilldiff demo — the 10-second experience.
//
// No setup, no scenario authoring, no harness login: runs the bundled
// notes-helper example (a real recorded regression) through the full
// pipeline — report → verdict → orbit scene — and opens the orbit in the
// browser. The point is the moment: "the text diff said LGTM, this says
// the agent now creates a file the scenario forbids."

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadScenario } from "./scenario.js";
import { runScenario } from "./runner.js";
import { writeOrbit } from "./orbit.js";

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else if (platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort — the URL is printed regardless
  }
}

const dim = (s: string) => `\u001B[2m${s}\u001B[0m`;
const cyan = (s: string) => `\u001B[36m${s}\u001B[0m`;
const green = (s: string) => `\u001B[32m${s}\u001B[0m`;
const rose = (s: string) => `\u001B[31m${s}\u001B[0m`;

export async function runDemo(cwd = process.cwd()): Promise<{ passed: boolean; orbitPath: string }> {
  const pkgRoot = resolve(fileURLToPath(new URL("../package.json", import.meta.url)), "..");
  const oldTrace = join(pkgRoot, "examples/traces/notes-helper-old.json");
  const newTrace = join(pkgRoot, "examples/traces/notes-helper-new.json");
  const scenarioPath = join(pkgRoot, "examples/notes-helper.scenario.yaml");

  console.log();
  console.log(`  ${cyan("skilldiff demo")} ${dim("— behavioral regression testing for agent skills")}`);
  console.log();
  console.log(dim("  The setup: a skill that appends a note to NOTES.md. Someone edits"));
  console.log(dim("  one line of SKILL.md. git diff says: 1 file, 1 line changed. LGTM."));
  console.log(dim("  Let's run both versions and see what the agent actually does."));
  console.log();

  const scenario = await loadScenario(scenarioPath);
  const result = await runScenario(scenario, {
    oldTrace: resolve(oldTrace),
    newTrace: resolve(newTrace),
  });

  // Terminal report with ANSI color — the ledger is the money shot.
  const report = result.report;
  for (const line of report.split("\n")) {
    let out = line;
    if (line.includes("✗")) out = rose(line);
    else if (line.startsWith("Result")) out = line.includes("❌") ? rose(line) : green(line);
    else if (line.startsWith("###")) out = cyan(line);
    console.log(`  ${out}`);
  }

  // Orbit scene — written next to the user's cwd so it survives the demo.
  const orbitPath = join(cwd, "skilldiff-demo-orbit.html");
  await writeOrbit(resolve(oldTrace), resolve(newTrace), {
    out: orbitPath,
    name: "notes-helper",
    expect: scenario.expect,
  });

  console.log();
  console.log(`  ${green("▶ opening the behavior diff in your browser:")} ${dim(orbitPath)}`);
  openBrowser(`file://${orbitPath}`);

  console.log();
  console.log(dim("  That's the product: on every PR touching skills/**, this diff"));
  console.log(dim("  posts as a comment and gates the merge."));
  console.log();
  console.log(`  ${cyan("next steps")}`);
  console.log(`    ${dim("$")} npx skilldiff init          ${dim("# generate scenarios for YOUR skills")}`);
  console.log(`    ${dim("$")} npx skilldiff run <s.yaml>   ${dim("# diff a skill change on your repo")}`);
  console.log(`    ${dim("$")} npx skilldiff --help         ${dim("# all commands")}`);
  console.log();

  // Clean temp demo dir is unnecessary since we wrote into cwd.

  return { passed: result.passed, orbitPath };
}
