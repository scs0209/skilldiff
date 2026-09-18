// skilldiff v0.1 — skill auto-discovery for `skilldiff init`.
// Scans a repo for SKILL.md files in conventional locations and infers a
// starter scenario (name, skillPaths, prompt, expect) from each one.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface DiscoveredSkill {
  /** Repo-relative path to SKILL.md */
  path: string;
  /** Skill name from frontmatter, or directory name. */
  name: string;
  /** Description from frontmatter, if present. */
  description: string;
}

function parseFrontmatter(text: string): Record<string, string> {
  const fm: Record<string, string> = {};
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return fm;
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return fm;
}

async function findSkillFilesInDir(baseDir: string, skillsDir: string, depth = 0, out: string[] = []): Promise<string[]> {
  if (depth > 3) return out; // skills are shallow: <skills>/<name>/SKILL.md
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillMd = join(skillsDir, entry.name, "SKILL.md");
    try {
      const s = await stat(skillMd);
      if (s.isFile()) out.push(skillMd);
      else await findSkillFilesInDir(baseDir, join(skillsDir, entry.name), depth + 1, out);
    } catch {
      // not a skill dir; recurse one level (handles skills/<category>/<name>/SKILL.md)
      await findSkillFilesInDir(baseDir, join(skillsDir, entry.name), depth + 1, out);
    }
  }
  return out;
}

/** Discover SKILL.md files in conventional locations under repoRoot. */
export async function discoverSkills(repoRoot: string): Promise<DiscoveredSkill[]> {
  const candidateRoots = [
    join(repoRoot, ".claude", "skills"),
    join(repoRoot, "skills"),
    join(repoRoot, ".agents", "skills"),
  ];

  const found = new Map<string, DiscoveredSkill>();
  for (const root of candidateRoots) {
    const files = await findSkillFilesInDir(repoRoot, root);
    for (const file of files) {
      const rel = relative(repoRoot, file).split("\\").join("/");
      if (found.has(rel)) continue;
      let text = "";
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const fm = parseFrontmatter(text);
      const dirName = rel.split("/").slice(-2, -1)[0] ?? "skill";
      found.set(rel, {
        path: rel,
        name: fm.name || dirName,
        description: fm.description || "",
      });
    }
  }
  return [...found.values()];
}

/**
 * Infer a starter prompt for a skill.
 * Strategy: ask the agent to read the skill's own SKILL.md and follow it —
 * works generically for any skill, exercises the read path by construction.
 */
export function inferPrompt(skill: DiscoveredSkill): string {
  return (
    `You have a skill named "${skill.name}". Read the file ${skill.path} in this repo ` +
    `and follow its instructions exactly.` +
    (skill.description ? ` (${skill.description})` : "")
  );
}

/**
 * Build a starter scenario object for one discovered skill.
 * Expectations start minimal (tool_calls: [read]) and grow as the user
 * learns the skill's real behavior — init prints guidance on this.
 */
export function buildStarterScenario(skill: DiscoveredSkill): Record<string, unknown> {
  return {
    name: skill.name,
    skillPaths: [skill.path],
    fixture: "./", // TODO: point at a real fixture repo; "." works for self-testing
    prompt: inferPrompt(skill),
    expect: {
      tool_calls: ["read"],
    },
  };
}
