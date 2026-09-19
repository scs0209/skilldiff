// orbit command tests — generated HTML shape, data embedding, regression facts.

import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderOrbit, renderRateOrbit, writeOrbit, writeRateOrbit } from "../src/orbit.js";
import type { Expectations } from "../src/scenario.js";

const oldTrace = join(process.cwd(), "examples/traces/notes-helper-old.json");
const newTrace = join(process.cwd(), "examples/traces/notes-helper-new.json");

describe("orbit renderer", () => {
  it("emits a static node-chain behavior diff with both runs", async () => {
    const html = await renderOrbit(oldTrace, newTrace, { name: "notes-helper" });
    expect(html).toContain("class=\"board\"");
    expect(html).toContain("class=\"runrow\"");
    expect(html).toContain("old run");
    expect(html).toContain("new run");
    expect(html).toContain("notes-helper");
    expect(html).toContain("TODO.md");
    expect(html).toContain("REGRESSION");
    expect(html).toContain("FORBIDDEN");
    expect(html).toContain("</html>");
    expect(html).not.toContain("WebGLRenderer");
  });

  it("flags the novel-file regression from lessons example", async () => {
    const html = await renderOrbit(oldTrace, newTrace, {});
    expect(html).toContain("REGRESSION");
    expect(html).toContain("2 calls");
    expect(html).toContain("3 calls");
    expect(html).toContain("FORBIDDEN");
  });

  it("renders tool nodes with icon tiles and one semantic highlight", async () => {
    const html = await renderOrbit(oldTrace, newTrace, {});
    expect((html.match(/class="tile"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain("class=\"node forbid\"");
    expect(html).toContain("class=\"node dim\"");
    expect(html).toContain("class=\"badge forbid\"");
    expect(html).not.toContain("TOOL SWITCHED");
  });

  it("embeds archify tokens and stays static — no script, no playback", async () => {
    const html = await renderOrbit(oldTrace, newTrace, {});
    expect(html).toContain("JetBrains Mono");
    expect(html).toContain("#020617");
    expect(html).toContain("--border");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("id=\"play\"");
    expect(html).not.toContain("requestAnimationFrame");
  });

  it("writes a self-contained html file (no network, no external assets)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skilldiff-orbit-"));
    try {
      await writeOrbit(oldTrace, newTrace, { out: join(dir, "orbit.html"), name: "notes" });
      const out = await readFile(join(dir, "orbit.html"), "utf8");
      expect(out).toContain("class=\"board\"");
      expect(out.length).toBeGreaterThan(4_000); // inline CSS + markup + icons
      expect(out.length).toBeLessThan(200_000);  // no WebGL bundle anymore
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("grades both runs in an evaluation ledger — old passed, new REGRESSION", async () => {
    const html = await renderOrbit(oldTrace, newTrace, {});
    expect(html).toContain("class=\"ledger\"");
    expect(html).toContain("\u2713 PASS");
    expect(html).toContain("\u2717 REGRESSION");
    expect(html).toContain("must_not");
    expect(html).toContain("files_changed does not include TODO.md");
    expect(html).toContain("expectation derived from the old run");
  });

  it("uses scenario expectations when provided (no derivation note)", async () => {
    const expectTodo: Expectations = {
      files_changed: ["NOTES.md"],
      must_not: { files_changed: ["TODO.md"] },
      tool_calls: ["read"],
      output_contains: ["SPIKE"],
    };
    const html = await renderOrbit(oldTrace, newTrace, { expect: expectTodo });
    expect(html).toContain("class=\"ledger\"");
    expect(html).toContain("expectations from scenario");
    expect(html).not.toContain("derived from the old run");
    expect(html).toContain("\u2717 REGRESSION");
  });
});

describe("rate orbit renderer (Monte Carlo batch)", () => {
  const expectTodo: Expectations = {
    files_changed: ["NOTES.md"],
    must_not: { files_changed: ["TODO.md"] },
    tool_calls: ["read"],
    output_contains: ["SPIKE"],
  };
  const tenOld = Array.from({ length: 10 }, () => oldTrace);
  const tenNew = Array.from({ length: 10 }, () => newTrace);

  it("turns each assertion into a card with a failure rate and run ticks", async () => {
    const html = await renderRateOrbit({
      oldTraces: tenOld,
      newTraces: tenNew,
      expect: expectTodo,
      name: "notes-helper",
    });
    expect(html).toContain("class=\"board\"");
    expect(html).toContain("class=\"runrow rates\"");
    expect(html).toContain("asrt forbid");
    expect(html).toContain("10/10");
    expect(html).toContain("0/10");
    expect(html).toContain("REGRESSION");
    expect(html).toContain("class=\"tick");
    expect(html).toContain("</html>");
    expect(html).not.toContain("<script");
  });

  it("flags the deterministic TODO.md regression across all candidate runs", async () => {
    const html = await renderRateOrbit({
      oldTraces: tenOld,
      newTraces: tenNew,
      expect: expectTodo,
    });
    expect(html).not.toContain("STABLE");
    expect(html).toMatch(/✗ REGRESSION/);
    expect(html).toContain("must_not");
  });

  it("stays static and self-contained", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skilldiff-ratiorbit-"));
    try {
      await writeRateOrbit({
        oldTraces: tenOld,
        newTraces: tenNew,
        expect: expectTodo,
        out: join(dir, "rate.html"),
      });
      const out = await readFile(join(dir, "rate.html"), "utf8");
      expect(out).toContain("failure-rate orbit");
      expect(out).not.toContain("backdrop-filter");
      expect(out.length).toBeGreaterThan(4_000);
      expect(out.length).toBeLessThan(200_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});