// Unit tests for skill discovery (skilldiff init).

import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { discoverSkills, buildStarterScenario, inferPrompt } from "../src/discover.js";
import { runInit } from "../src/init.js";

async function makeRepo(structure: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skilldiff-discover-"));
  for (const [relPath, content] of Object.entries(structure)) {
    const abs = join(dir, relPath);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
  return dir;
}

const notesSkill = `---
name: notes-helper
description: Helps take and organize notes
---

Take notes when asked.
`;

describe("discoverSkills", () => {
  it("finds skills in .claude/skills", async () => {
    const repo = await makeRepo({ ".claude/skills/notes-helper/SKILL.md": notesSkill });
    const skills = await discoverSkills(repo);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("notes-helper");
    expect(skills[0].path).toBe(".claude/skills/notes-helper/SKILL.md");
    expect(skills[0].description).toBe("Helps take and organize notes");
  });

  it("finds skills in skills/", async () => {
    const repo = await makeRepo({ "skills/deploy/SKILL.md": notesSkill });
    const skills = await discoverSkills(repo);
    expect(skills).toHaveLength(1);
    expect(skills[0].path).toBe("skills/deploy/SKILL.md");
  });

  it("finds skills in both locations without duplicates", async () => {
    const repo = await makeRepo({
      ".claude/skills/a/SKILL.md": notesSkill,
      "skills/b/SKILL.md": notesSkill,
    });
    const skills = await discoverSkills(repo);
    expect(skills).toHaveLength(2);
  });

  it("returns empty when no skills exist", async () => {
    const repo = await makeRepo({ "README.md": "nothing here" });
    expect(await discoverSkills(repo)).toHaveLength(0);
  });

  it("falls back to directory name when frontmatter lacks name", async () => {
    const noName = "---\ndescription: x\n---\nbody";
    const repo = await makeRepo({ ".claude/skills/my-thing/SKILL.md": noName });
    const skills = await discoverSkills(repo);
    expect(skills[0].name).toBe("my-thing");
  });

  it("does not treat non-SKILL.md files as skills", async () => {
    const repo = await makeRepo({ ".claude/skills/a/OTHER.md": notesSkill });
    expect(await discoverSkills(repo)).toHaveLength(0);
  });
});

describe("buildStarterScenario", () => {
  it("produces a minimal valid scenario shape", () => {
    const scenario = buildStarterScenario({
      path: ".claude/skills/notes-helper/SKILL.md",
      name: "notes-helper",
      description: "note taker",
    });
    expect(scenario.name).toBe("notes-helper");
    expect(scenario.skillPaths).toEqual([".claude/skills/notes-helper/SKILL.md"]);
    const prompt = scenario.prompt as string;
    expect(prompt).toContain("notes-helper");
    expect(prompt).toContain(".claude/skills/notes-helper/SKILL.md");
    expect((scenario.expect as Record<string, unknown>).tool_calls).toEqual(["read"]);
  });

  it("prompt references the skill path for the read assertion", () => {
    const skill = { path: "skills/x/SKILL.md", name: "x", description: "" };
    expect(inferPrompt(skill)).toContain("skills/x/SKILL.md");
  });
});

describe("runInit", () => {
  it("writes one scenario file per discovered skill", async () => {
    const repo = await makeRepo({
      ".claude/skills/notes-helper/SKILL.md": notesSkill,
      "skills/deploy/SKILL.md": notesSkill,
    });
    const result = await runInit(repo, join(repo, "skilldiff"));
    expect(result.created).toHaveLength(2);
    expect(result.created[0]).toContain("notes-helper.scenario.yaml");
  });

  it("creates nothing when no skills found", async () => {
    const repo = await makeRepo({ "README.md": "empty" });
    const result = await runInit(repo, join(repo, "skilldiff"));
    expect(result.created).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
  });
});
