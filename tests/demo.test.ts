// demo command tests — the 10-second experience must work in-process.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDemo } from "../src/demo.js";

let dir: string;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined as unknown as string;
});

describe("skilldiff demo", () => {
  it("runs the bundled regression end-to-end and writes the orbit", async () => {
    dir = await mkdtemp(join(tmpdir(), "skilldiff-demo-"));
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (l: string) => logs.push(l);
    try {
      const { passed, orbitPath } = await runDemo(dir);
      // The bundled example IS a regression — demo must report it honestly.
      expect(passed).toBe(false);
      const orbit = await readFile(orbitPath, "utf8");
      expect(orbit).toContain("class=\"ledger\"");
      expect(orbit).toContain("REGRESSION");
      expect(orbit).not.toContain("<script");
      const printed = logs.join("\n");
      expect(printed).toContain("behavior regression");
      expect(printed).toContain("What to fix");
      expect(printed).toContain("npx skilldiff init");
    } finally {
      console.log = origLog;
    }
  });

  it("writes the orbit next to the requested cwd", async () => {
    dir = await mkdtemp(join(tmpdir(), "skilldiff-demo2-"));
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (l: string) => logs.push(l);
    try {
      const { orbitPath } = await runDemo(dir);
      expect(orbitPath).toContain("skilldiff-demo-orbit.html");
      await expect(readFile(orbitPath, "utf8")).resolves.toContain("</html>");
    } finally {
      console.log = origLog;
    }
  });
});
