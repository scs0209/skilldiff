// skilldiff v0.1 — baseline fetch: retrieve the OLD version of skill files
// from a git ref (base branch / commit) without touching the working tree.
//
// Design doc decision: `git show <base>:<path>` into a temp copy.
// Gate 2 of the spike validated exactly this mechanism.

import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export interface SkillVersion {
  /** Temp directory containing the skill files at this version. */
  dir: string;
  /** The files successfully retrieved (repo-relative paths). */
  files: string[];
}

function gitShow(repoPath: string, ref: string, filePath: string): Buffer | null {
  try {
    return execFileSync("git", ["show", `${ref}:${filePath}`], {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return null; // file did not exist at that ref
  }
}

export function gitRefExists(repoPath: string, ref: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", ref], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch skill files as of `baseRef` into a temp directory.
 * Missing files at that ref are skipped and reported in `files` (only found ones listed).
 */
export async function fetchSkillVersion(
  repoPath: string,
  baseRef: string,
  skillPaths: string[],
): Promise<SkillVersion> {
  if (!gitRefExists(repoPath, baseRef)) {
    throw new Error(`git ref '${baseRef}' not found in ${repoPath}`);
  }

  const dir = await mkdtemp(join(tmpdir(), "skilldiff-baseline-"));
  const files: string[] = [];

  for (const skillPath of skillPaths) {
    const content = gitShow(repoPath, baseRef, skillPath);
    if (content === null) continue;
    const dest = join(dir, skillPath);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content);
    files.push(skillPath);
  }

  if (files.length === 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(
      `none of the skill paths exist at ref '${baseRef}': ${skillPaths.join(", ")}`,
    );
  }

  return { dir, files };
}

/** Clean up a fetched version's temp dir (best effort). */
export async function cleanupSkillVersion(version: SkillVersion): Promise<void> {
  await rm(version.dir, { recursive: true, force: true }).catch(() => {});
}
