// Unit tests for baseline fetch (git show old skill versions).

import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchSkillVersion, cleanupSkillVersion, gitRefExists } from "../src/baseline.js";

const cleanups: Promise<void>[] = [];

afterAll(async () => {
  await Promise.all(cleanups);
});

async function makeGitRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skilldiff-test-repo-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir });
  const skillDir = join(dir, ".claude", "skills", "notes-helper");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    "---\nname: notes-helper\n---\n\nORIGINAL instructions.",
  );
  git("init");
  git("add", "-A");
  git("commit", "-m", "init");
  return dir;
}

describe("gitRefExists", () => {
  it("returns true for HEAD", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    expect(gitRefExists(repo, "HEAD")).toBe(true);
  });

  it("returns false for a bogus ref", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    expect(gitRefExists(repo, "refs/heads/does-not-exist")).toBe(false);
  });
});

describe("fetchSkillVersion", () => {
  it("retrieves old skill content from HEAD~1 after a change", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    const skillPath = ".claude/skills/notes-helper/SKILL.md";

    // Change the skill and commit
    await writeFile(join(repo, skillPath), "---\nname: notes-helper\n---\n\nCHANGED instructions.");
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "change"], { cwd: repo });

    const version = await fetchSkillVersion(repo, "HEAD~1", [skillPath]);
    cleanups.push(cleanupSkillVersion(version));

    expect(version.files).toEqual([skillPath]);
    const content = await readFile(join(version.dir, skillPath), "utf8");
    expect(content).toContain("ORIGINAL instructions.");
    expect(content).not.toContain("CHANGED instructions.");
  });

  it("skips files that did not exist at the ref", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    const existing = ".claude/skills/notes-helper/SKILL.md";
    const missing = ".claude/skills/new-skill/SKILL.md";

    const version = await fetchSkillVersion(repo, "HEAD", [existing, missing]);
    cleanups.push(cleanupSkillVersion(version));

    expect(version.files).toEqual([existing]);
  });

  it("throws when no skill paths exist at the ref", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    await expect(
      fetchSkillVersion(repo, "HEAD", [".claude/skills/never-existed/SKILL.md"]),
    ).rejects.toThrow(/none of the skill paths exist/);
  });

  it("throws when the ref does not exist", async () => {
    const repo = await makeGitRepo();
    cleanups.push(rm(repo, { recursive: true, force: true }));
    await expect(fetchSkillVersion(repo, "refs/heads/nope", ["x"])).rejects.toThrow(/not found/);
  });
});
