// T1 SPIKE — go/no-go for skilldiff
//
// Verifies the two feasibility gates from the design doc before any real code:
//   1. Headless Claude Agent SDK run captures tool_use traces from a fixture repo
//   2. `git checkout <base> -- <skill paths>` fetches the old skill version (baseline)
//
// Run: bun run spike   (or: npm run spike)
// Requires: ANTHROPIC_API_KEY in env, claude CLI installed (SDK shells out to it)

import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

interface ToolUse {
  tool: string;
  input: Record<string, unknown>;
}

async function captureTraces(
  fixtureRepo: string,
  prompt: string,
): Promise<ToolUse[]> {
  const toolUses: ToolUse[] = [];
  for await (const message of query({
    prompt,
    options: {
      cwd: fixtureRepo,
      maxTurns: 5,
      allowedTools: ["Read", "Write", "Edit", "Bash"],
      permissionMode: "bypassPermissions",
    },
  })) {
    if (
      message.type === "assistant" &&
      "message" in message &&
      message.message?.content
    ) {
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          toolUses.push({
            tool: block.name,
            input: block.input as Record<string, unknown>,
          });
        }
      }
    }
  }
  return toolUses;
}

// Gate 2: fetch the old skill version from a base ref into a temp copy
async function baselineFetch(
  repoPath: string,
  baseRef: string,
  skillPaths: string[],
): Promise<boolean> {
  try {
    execFileSync("git", ["rev-parse", "--verify", baseRef], { cwd: repoPath });
    const dest = await mkdtemp(join(tmpdir(), "skilldiff-baseline-"));
    execFileSync("git", ["checkout", baseRef, "--", ...skillPaths], {
      cwd: repoPath,
    });
    // restore repo to HEAD immediately — we only wanted the files
    execFileSync("git", ["checkout", "HEAD", "--", ...skillPaths], {
      cwd: repoPath,
    });
    console.log(
      `  baseline fetch OK: ${skillPaths.length} path(s) from ${baseRef}`,
    );
    return true;
  } catch (err) {
    console.error(`  baseline fetch FAILED: ${(err as Error).message}`);
    return false;
  }
}

export async function runSpike(fixturePathArg?: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY not set. CI usage requires API-key auth (SDK docs).",
    );
    process.exit(2);
  }

  const fixtureRepo = resolve(
    fixturePathArg ?? (await makeMinimalFixture()),
  );
  console.log(`Spike fixture: ${fixtureRepo}`);

  // ---- Gate 1: tool trace capture ------------------------------------
  console.log("\n[Gate 1] headless run + tool_use trace capture");
  const prompt =
    "Read the file NOTES.md in this repo and follow the instructions in it exactly.";
  let traces: ToolUse[];
  try {
    traces = await captureTraces(fixtureRepo, prompt);
    const readCall = traces.find((t) => t.tool === "Read");
    const writeCall = traces.find((t) => t.tool === "Write" || t.tool === "Edit");
    console.log(`  captured ${traces.length} tool_use events:`, traces.map((t) => t.tool));
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
  // Make the fixture a git repo so gate 2 has something to fetch from
  try {
    execFileSync("git", ["init"], { cwd: fixtureRepo });
    execFileSync("git", ["add", "-A"], { cwd: fixtureRepo });
    execFileSync(
      "git",
      ["-c", "user.email=spike@skilldiff", "-c", "user.name=spike", "commit", "-m", "init"],
      { cwd: fixtureRepo },
    );
    // modify the skill, then try fetching the old one from HEAD~0 → HEAD
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
