/**
 * Re-render the two orbit hero images (docs/assets/orbit-hero.png and
 * docs/assets/orbit-rate-hero.png) from the current renderer.
 *
 * Run whenever the orbit renderer changes so the README never shows a
 * scene the tool no longer produces:
 *
 *   npm run assets
 *
 * Requires Google Chrome (the default) or CHROME_PATH pointing at a
 * Chromium-based browser. playwright-core is already a devDependency.
 */
import { chromium } from "playwright-core";
import { renderOrbit, renderRateOrbit } from "../src/orbit.js";
import { loadScenario } from "../src/scenario.js";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "docs", "assets");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
].filter((p): p is string => Boolean(p) && existsSync(p as string));

if (CHROME_CANDIDATES.length === 0) {
  console.error(
    "No Chrome/Chromium found. Install Google Chrome or set CHROME_PATH.",
  );
  process.exit(1);
}

async function shoot(
  html: string,
  out: string,
  width: number,
  opts: { fullPage?: boolean } = {},
) {
  await writeFile("/tmp/skilldiff-hero-shoot.html", html);
  const browser = await chromium.launch({ executablePath: CHROME_CANDIDATES[0] });
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
  });
  await page.goto("file:///tmp/skilldiff-hero-shoot.html");
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: opts.fullPage ?? false });
  await browser.close();
  console.log(`  wrote ${out}`);
}

// ── orbit hero: single-run scene incl. the verdict ledger ───────────────
const orbit = await renderOrbit(
  join(ROOT, "examples/traces/notes-helper-old.json"),
  join(ROOT, "examples/traces/notes-helper-new.json"),
  { name: "notes-helper" },
);

// ── rate hero: redesigned assertion cards with failure-rate slopes ─────
// Uses the pdf validation scenario (a real anthropics/skills skill) so the
// README shows regression cards from more than just the bundled demo.
const PDF_SCENARIO = join(ROOT, ".validation/fixtures/pdf.scenario.yaml");
const PDF_OLD = join(ROOT, ".validation/traces/pdf-old.json");
const PDF_NEW = join(ROOT, ".validation/traces/pdf-new.json");

let rate: string;
if (existsSync(PDF_SCENARIO)) {
  const scen = await loadScenario(PDF_SCENARIO);
  rate = await renderRateOrbit({
    name: scen.name ?? "pdf",
    oldTraces: [PDF_OLD],
    newTraces: [PDF_NEW],
    expect: scen.expect,
  });
} else {
  // Fall back to the bundled demo traces if .validation/ isn't present.
  rate = await renderRateOrbit({
    name: "notes-helper",
    oldTraces: [join(ROOT, "examples/traces/notes-helper-old.json")],
    newTraces: [join(ROOT, "examples/traces/notes-helper-new.json")],
    expect: {
      files_changed: ["NOTES.md"],
      tool_calls: ["read", "write"],
      output_contains: ["SPIKE RAN OK"],
    },
  });
}

await mkdir(ASSETS, { recursive: true });
const wrap = (body: string) =>
  `<html><head><style>*{margin:0;padding:0}</style></head><body>${body}</body></html>`;

await shoot(wrap(orbit), join(ASSETS, "orbit-hero.png"), 1280, { fullPage: true });
await shoot(wrap(rate), join(ASSETS, "orbit-rate-hero.png"), 1280, { fullPage: true });
console.log("done");
