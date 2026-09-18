// T1 SPIKE — go/no-go for skilldiff (harness-adapter edition)
//
// Verifies the two feasibility gates from the design doc before any real code:
//   1. An installed harness CLI (claude / cursor-agent / codex), run headless,
//      emits a parseable JSON event stream with tool-use events from a fixture repo.
//   2. `git show <base>:<skill path>` fetches the old skill version (baseline).
//
// Run: npm run spike [path-to-fixture]
// Requires: at least one harness CLI installed + logged in (its own subscription
// is fine — no ANTHROPIC_API_KEY needed).

import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ADAPTERS, type HarnessAdapter, type ToolUse } from "./adapters.js";

function which(cmd: string): string | null {
  try {
    return execFileSync("which", [cmd], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

function pickAdapter(): HarnessAdapter {
  const forEnv = process.env.SKILLDIFF_HARNESS;
  if (forEnv) {
    const found = ADAPTERS.find((a) => a.name === forEnv);
    if (!found) {
      console.error(`SKILLDIFF_HARNESS=${forEnv} is not one of: ${ADAPTERS.map((a) => a.name).join(", ")}`);
      process.exit(2);
    }
    if (!which(found.cmd)) {
      console.error(`${found.cmd} not found in PATH`);
      process.exit(2);
    }
    return found;
  }
  for (const a of ADAPTERS) {
    if (which(a.cmd)) return a;
  }
  console.error("No harness CLI found. Install one of: claude, cursor-agent, codex");
  process.exit(2);
}

function runHarness(adapter: HarnessAdapter, cwd: string, prompt: string): Promise<{ traces: ToolUse[]; stderr: string; code: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(adapter.cmd, [...adapter.baseArgs, prompt], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const traces: ToolUse[] = [];
    let stderr = "";
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // non-JSON noise lines are expected from some harnesses
        }
        traces.push(...adapter.extractToolUses(parsed));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolvePromise({ traces, stderr, code }));
    child.on("error", (err) => {
      stderr += String(err);
      resolvePromise({ traces, stderr, code: -1 });
    });
  });
}

// Gate 2: fetch the old skill version from a base ref into a temp copy
async function baselineFetch(repoPath: string, baseRef: string, skillPaths: string[]): Promise<boolean> {
  try {
    execFileSync("git", ["rev-parse", "--verify", baseRef], { cwd: repoPath });
    const dest = await mkdtemp(join(tmpdir(), "skilldiff-baseline-"));
    execFileSync("git", ["checkout", baseRef, "--", ...skillPaths], { cwd: repoPath });
    // restore repo to HEAD immediately — we only wanted the files
    execFileSync("git", ["checkout", "HEAD", "--", ...skillPaths], { cwd: repoPath });
    void dest;
    console.log(`  baseline fetch OK: ${skillPaths.length} path(s) from ${baseRef}`);
    return true;
  } catch (err) {
    console.error(`  baseline fetch FAILED: ${(err as Error).message}`);
    return false;
  }
}

export async function runSpike(fixturePathArg?: string): Promise<void> {
  const adapter = pickAdapter();
  console.log(`Spike harness: ${adapter.name} (${which(adapter.cmd)})`);

  const fixtureRepo = resolve(fixturePathArg ?? (await makeMinimalFixture()));
  console.log(`Spike fixture: ${fixtureRepo}`);

  // ---- Gate 1: tool trace capture ------------------------------------
  console.log(`\n[Gate 1] headless ${adapter.name} run + tool-use trace capture`);
  const prompt = "Read the file NOTES.md in this repo and follow the instructions in it exactly.";
  try {
    const { traces, stderr, code } = await runHarness(adapter, fixtureRepo, prompt);
    if (stderr.trim()) console.log(`  harness stderr: ${stderr.trim().slice(0, 500)}`);
    if (code !== 0 && traces.length === 0) {
      console.error(`  Gate 1: FAIL — harness exited ${code} with no tool events captured`);
      if (stderr.trim()) console.error(`  stderr: ${stderr.trim().slice(0, 1000)}`);
      process.exit(3);
    }
    const readCall = traces.find((t) => t.tool.toLowerCase().includes("read"));
    const writeCall = traces.find((t) => /write|edit/i.test(t.tool));
    console.log(`  captured ${traces.length} tool events:`, traces.map((t) => t.tool));
    if (readCall && writeCall) {
      console.log("  Gate 1: PASS (Read + Write observed — assertions are feasible)");
    } else {
      console.log("  Gate 1: PARTIAL — traces captured but expected tools missing");
      process.exit(3);
    }
  } catch (err) {
    console.error(`  Gate 1: FAIL — ${(err as Error).message}`);
    process.exit(3);
  }

  // ---- Gate 2: baseline fetch ----------------------------------------
  console.log("\n[Gate 2] git baseline fetch (old skill version)");
  try {
    execFileSync("git", ["init"], { cwd: fixtureRepo });
    execFileSync("git", ["add", "-A"], { cwd: fixtureRepo });
    execFileSync(
      "git",
      ["-c", "user.email=spike@skilldiff", "-c", "user.name=spike", "commit", "-m", "init"],
      { cwd: fixtureRepo },
    );
    // modify the skill, then try fetching the old one from HEAD~1
    const skillPath = join(fixtureRepo, ".claude", "skills", "notes-helper", "SKILL.md");
    await writeFile(skillPath, "---\nname: notes-helper\n---\n\nCHANGED instructions.");
    execFileSync("git", ["add", "-A"], { cwd: fixtureRepo });
    execFileSync(
      "git",
      ["-c", "user.email=spike@skilldiff", "-c", "user.name=spike", "commit", "-m", "change skill"],
      { cwd: fixtureRepo },
    );
    const oldContent = execFileSync(
      "git",
      ["show", "HEAD~1:.claude/skills/notes-helper/SKILL.md"],
      { cwd: fixtureRepo },
    ).toString();
    const ok = oldContent.includes("ORIGINAL");
    console.log(`  git show of old skill: ${ok ? "OK (original content retrieved)" : "MISMATCH"}`);
    console.log(ok ? "  Gate 2: PASS" : "  Gate 2: FAIL");
    process.exit(ok ? 0 : 4);
  } catch (err) {
    console.error(`  Gate 2: FAIL — ${(err as Error).message}`);
    process.exit(4);
  }
}

async function makeMinimalFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skilldiff-fixture-"));
  const skillDir = join(dir, ".claude", "skills", "notes-helper");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    [
      "---",
      "name: notes-helper",
      "description: Helps take and organize notes",
      "---",
      "",
      "# notes-helper",
      "",
      "When asked to take a note: create or update NOTES.md with the content,",
      "then confirm what you wrote.",
      "",
      "ORIGINAL instructions for baseline comparison.",
    ].join("\n"),
  );
  await writeFile(
    join(dir, "NOTES.md"),
    "Instructions: use the notes-helper skill to append 'SPIKE RAN OK' to this file.",
  );
  console.log(`  created minimal fixture at ${dir}`);
  return dir;
}

// direct execution support: `tsx scripts/spike.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  await runSpike(process.argv[2]);
}
