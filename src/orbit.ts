// skilldiff orbit — renders two agent traces as a self-contained "behavior
// engine" scene: the recorded baseline (old run) sits as a column of tool-call
// cards on the left, the candidate (new run) on the right, and both flow
// through a glowing diff engine at the center along particle bezier streams.
// The engine's pills carry the observable delta (calls, files, verdict); a
// card only lights up when behavior actually changes (NEW, REMOVED, TOOL
// SWITCHED, FORBIDDEN badges). Shared steps recede.
//   skilldiff orbit <old.json> <new.json> [--out orbit.html] [--name "..."]
//
// Batch mode ("rate orbit"): given N baseline + N candidate traces and the
// scenario's expectations, each assertion becomes a card carrying its
// empirical failure rate (fails/N) plus per-run tick cells. "single run is a
// sample" — the whole point is showing the distribution, not one draw.
//   skilldiff orbit --old a.json ... --new b.json ... --scenario s.yaml
//
// Visual system: archify midnight canvas + neon engine vocabulary. Everything
// inside the scene is one SVG in viewBox units, so streams always terminate
// exactly on ports at any scale. Color identifies meaning, never decoration.
// Motion is declarative only (SMIL + CSS keyframes — packets riding the
// streams, breathing orb, blinking ports): zero JS, one self-contained page.

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRecordedTrace } from "./runner.js";
import { normalizeToolName, evaluateAssertions, type AssertionResult } from "./assertions.js";
import { buildTrace } from "./trace-utils.js";
import type { Expectations } from "./scenario.js";

// archify palette.
const INK = "#F8FAFC";
const MUTED = "#94A3B8";
const DIM = "#64748B";
const BORDER = "#1E293B";
const MASK = "#0F172A";
const CANVAS = "#020617";
const CYAN = "#22D3EE"; // semantic: inserted behavior
const ROSE = "#FB7185"; // semantic: regression / forbidden path
const GREEN = "#34D399"; // semantic: verified / compatible
const AMBER = "#FBBF24"; // semantic: changed / removed step
const BLUE = "#3B82F6"; // semantic: baseline stream
const VIOLET = "#A78BFA"; // semantic: candidate stream

// Tool identities. Color = what the agent did.
export const LANES = [
  { tool: "read", color: "#22d3ee" },
  { tool: "write", color: "#a78bfa" },
  { tool: "bash", color: "#fbbf24" },
  { tool: "glob", color: "#34d399" },
  { tool: "grep", color: "#f472b6" },
  { tool: "spawn", color: "#fb923c" },
  { tool: "other", color: "#94a3b8" },
] as const;

function toolColor(tool: string): string {
  const t = normalizeToolName(tool);
  return LANES.find((l) => l.tool === t)?.color ?? "#94a3b8";
}

// Inner path data for each tool icon (24×24 stroke space).
function iconPaths(tool: string): string {
  switch (normalizeToolName(tool)) {
    case "read":
      return '<path d="M12 5C7 5 3.2 8 2 12c1.2 4 5 7 10 7s8.8-3 10-7c-1.2-4-5-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
    case "write":
      return '<path d="M17 3.5l3.5 3.5L8 19.5H4.5V16L17 3.5z"/>';
    case "bash":
      return '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7.5 9.5l3 2.5-3 2.5"/><path d="M13 14.5h3.5"/>';
    case "glob":
      return '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/>';
    case "grep":
      return '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/><path d="M7.5 10h4M7.5 12.5h2.5"/>';
    case "spawn":
      return '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>';
    default:
      return '<circle cx="12" cy="12" r="6.5"/>';
  }
}

const SWAP_ICON =
  '<path d="M6.5 9h9.5l-2.6-2.6"/><path d="M17.5 15H8l2.6 2.6"/>';

// ─── Evaluation ledger: grade both runs against the contract ────────────────

interface LedgerRow {
  kind: string;
  expected: string;
  oldPass: boolean;
  newPass: boolean;
  regression: boolean; // old passed, new fails — the skilldiff verdict
}

function toRunTrace(t: Awaited<ReturnType<typeof loadRecordedTrace>>) {
  return buildTrace({
    toolCalls: t.toolCalls,
    output: t.output ?? "",
    filesChanged: t.filesChanged,
    warnings: t.warnings,
  });
}

/** Old behavior is the contract: derive expectations from the baseline run. */
function deriveExpect(
  oldTrace: Awaited<ReturnType<typeof loadRecordedTrace>>,
  newTrace: Awaited<ReturnType<typeof loadRecordedTrace>>,
  explicit?: Expectations,
): { expect: Expectations; derived: boolean } {
  if (explicit) return { expect: explicit, derived: false };
  const oldRun = toRunTrace(oldTrace);
  const expect: Expectations = {};
  if (oldRun.filesChanged.length) expect.files_changed = [...new Set(oldRun.filesChanged)];
  const tools = [...new Set(oldRun.toolCalls.map((tc) => normalizeToolName(tc.tool)))];
  if (tools.length) expect.tool_calls = tools;
  if (oldRun.commandsRun.length) expect.commands_run = [...new Set(oldRun.commandsRun)];
  const oldFiles = oldTrace.filesChanged ?? [];
  const novel = (newTrace.filesChanged ?? []).filter(
    (f) => !oldFiles.some((o) => o.toLowerCase() === f.toLowerCase()),
  );
  if (novel.length) expect.must_not = { files_changed: novel };
  return { expect, derived: true };
}

function buildLedger(
  oldRun: ReturnType<typeof toRunTrace>,
  newRun: ReturnType<typeof toRunTrace>,
  expect: Expectations,
): LedgerRow[] {
  const o = evaluateAssertions(oldRun, expect);
  const nu = evaluateAssertions(newRun, expect);
  const rows: LedgerRow[] = [];
  for (const a of o) {
    const b = nu.find((x) => x.kind === a.kind && x.expected === a.expected);
    if (!b) continue;
    rows.push({ kind: a.kind, expected: a.expected, oldPass: a.pass, newPass: b.pass, regression: a.pass && !b.pass });
  }
  return rows;
}

function ledgerHTML(rows: LedgerRow[], derived: boolean): string {
  if (!rows.length) return "";
  const cell = (pass: boolean, failLabel: string) =>
    pass ? '<span class="lg-cell pass">\u2713 PASS</span>' : `<span class="lg-cell fail">\u2717 ${failLabel}</span>`;
  const body = rows
    .map((r) => {
      const reg = r.regression;
      return `<div class="lg-row${reg ? " reg" : ""}"><span class="lg-kind">${escapeHtml(r.kind)}</span><span class="lg-exp">${escapeHtml(r.expected)}</span>${cell(r.oldPass, "FAIL")}${cell(r.newPass, reg ? "REGRESSION" : "FAIL")}</div>`;
    })
    .join("");
  const note = derived
    ? "expectation derived from the old run \u2014 old behavior is the contract"
    : "expectations from scenario";
  return `<section class="ledger"><div class="lg-head"><span>assertion</span><span>expectation</span><span>baseline</span><span>candidate</span></div>${body}<div class="lg-note">${note}</div></section>`;
}
import { aggregateBatch, detectBatchRegressions, type BatchAssertion, type BatchRegression, type SideResult } from "./report.js";

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface OrbitOptions {
  out?: string;
  name?: string;
  /**
   * Expectations to grade BOTH runs against. When omitted, the contract is
   * derived from the old run: whatever the baseline did is the spec, and any
   * file the candidate touched that the baseline didn't becomes a must_not.
   */
  expect?: Expectations;
}

interface StepInfo {
  tool: string;
  file: string | null;
  input: string;
}

function describeSteps(
  trace: Awaited<ReturnType<typeof loadRecordedTrace>>,
  filesChanged: string[],
  prefer: string[] = [],
): StepInfo[] {
  const steps: StepInfo[] = [];
  for (const tc of trace.toolCalls) {
    let inputText = "";
    try {
      inputText = JSON.stringify(tc.input ?? {});
    } catch {
      inputText = "";
    }
    const lower = inputText.toLowerCase();
    const hit = (f: string) => lower.includes(f.toLowerCase());
    const preferred = prefer.find(hit);
    const file = preferred ?? filesChanged.find(hit) ?? null;
    steps.push({ tool: normalizeToolName(tc.tool), file, input: inputText.slice(0, 4000) });
  }
  return steps;
}

function shortFile(file: string): string {
  const segs = file.split("/");
  const s = segs.length > 3 ? "…/" + segs.slice(-2).join("/") : file;
  return s.length > 30 ? s.slice(0, 29) + "…" : s;
}

// ─── Scene geometry (all in SVG viewBox units) ──────────────────────────────

type RowKind = "same" | "new" | "removed" | "switch" | "forbidden";

const STAGE_W = 1440;
const CARD_W = 300;
const CARD_H = 84;
const PITCH = 128; // vertical distance between card centers
const TOP_ZONE = 178; // room for column headers
const ORB_R = 112;
const ANCHOR_DX = 26; // stream anchors sit this far outside the ring
const ANCHOR_PITCH = 34; // vertical spread of stream anchors on the orb

function columnY0(count: number): number {
  return TOP_ZONE + ((count - 1) * PITCH + CARD_H) / 2;
}

// Deterministic pseudo-random (no Math.random — same traces, same pixels).
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

type Pt = [number, number];

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

function bezAngle(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): number {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy =
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function curveD(p0: Pt, p1: Pt, p2: Pt, p3: Pt): string {
  return `M${p0[0]},${p0[1]} C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
}

// A particle stream along a bezier: faint guide curve + flowing dash current +
// data dots + chip dashes + packets that travel the curve (declarative SMIL —
// no JS). Motion direction always reads source → destination.
function streamSvg(
  p0: Pt,
  p3: Pt,
  color: string,
  seed: number,
  intensity: number,
  chipTs: number[],
): string {
  const dx = (p3[0] - p0[0]) * 0.42;
  const p1: Pt = [p0[0] + dx, p0[1]];
  const p2: Pt = [p3[0] - dx, p3[1]];
  const d = curveD(p0, p1, p2, p3);
  const pid = `sp${Math.abs(Math.round(seed))}`;
  const parts: string[] = [];

  parts.push(
    `<path class="stream" d="${d}" fill="none" stroke="${color}" stroke-opacity="${(0.22 * intensity).toFixed(2)}" stroke-width="1.4"/>`,
  );
  parts.push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${(0.5 * intensity).toFixed(2)}" stroke-width="1.6" stroke-dasharray="5 15" class="flowdash" style="animation-duration:${(1.3 + 0.7 * rnd(seed + 91)).toFixed(2)}s"/>`,
  );

  // data dots — even spread with deterministic jitter, some in small clusters
  const N = 16;
  for (let i = 0; i < N; i++) {
    const base = (i + 0.5) / N;
    const t = Math.min(0.97, Math.max(0.03, base + (rnd(seed + i * 7.3) - 0.5) * 0.05));
    const r = 1.6 + 1.9 * rnd(seed + i * 13.7);
    const op = (0.3 + 0.62 * rnd(seed + i * 29.1)) * intensity;
    const [x, y] = bez(p0, p1, p2, p3, t);
    parts.push(`<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${op.toFixed(2)}"/>`);
    if (i % 4 === 1) {
      for (const dt of [-0.022, 0.022]) {
        const [cx2, cy2] = bez(p0, p1, p2, p3, Math.min(0.98, Math.max(0.02, t + dt)));
        parts.push(`<circle class="dot" cx="${cx2.toFixed(1)}" cy="${cy2.toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="${color}" opacity="${(op * 0.8).toFixed(2)}"/>`);
      }
    }
    if (i % 3 === 2) {
      const [gx, gy] = bez(p0, p1, p2, p3, t);
      parts.push(`<circle class="dot" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="1.1" fill="${color}" opacity="${(0.16 * intensity).toFixed(2)}"/>`);
    }
  }

  // chip dashes riding the stream
  for (const t of chipTs) {
    const [x, y] = bez(p0, p1, p2, p3, t);
    const a = bezAngle(p0, p1, p2, p3, t);
    parts.push(
      `<rect class="chip" x="${(x - 13).toFixed(1)}" y="${(y - 3.5).toFixed(1)}" width="26" height="7" rx="3.5" fill="${color}" opacity="${(0.75 * intensity).toFixed(2)}" transform="rotate(${a.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`,
    );
  }

  // packets traveling the curve (SMIL, negative begin = already in flight)
  parts.push(`<path id="${pid}" d="${d}" fill="none" stroke="none"/>`);
  for (let m = 0; m < 3; m++) {
    const dur = (2.6 + 1.7 * rnd(seed + 400 + m * 17)).toFixed(2);
    const begin = (-(rnd(seed + 500 + m * 23) * 4)).toFixed(2);
    const r = (1.7 + 1.2 * rnd(seed + 600 + m * 31)).toFixed(1);
    parts.push(
      `<circle r="${r}" fill="${color}" opacity="0.95"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" rotate="0"><mpath xlink:href="#${pid}"/></animateMotion></circle>`,
    );
  }
  return parts.join("");
}

function stateStyle(
  kind: RowKind,
  side: "old" | "new",
): { border: string; borderOp: number; dash: string; groupOp: number } {
  if (kind === "forbidden") return { border: ROSE, borderOp: 0.95, dash: "", groupOp: 1 };
  if (kind === "new") return { border: CYAN, borderOp: 0.9, dash: "", groupOp: 1 };
  if (kind === "switch") return { border: AMBER, borderOp: 0.9, dash: "", groupOp: 1 };
  if (kind === "removed") return { border: AMBER, borderOp: 0.85, dash: "5 4", groupOp: 0.95 };
  return {
    border: side === "old" ? BLUE : VIOLET,
    borderOp: 0.34,
    dash: "",
    groupOp: 0.62,
  };
}

function badgeSvg(kind: RowKind, side: "old" | "new", rightX: number, cardY: number): string {
  const forbid = kind === "forbidden" && side === "new";
  const isNew = kind === "new" && side === "new";
  const isSwitch = kind === "switch";
  const isRemoved = kind === "removed" && side === "old";
  const label = forbid ? "FORBIDDEN" : isNew ? "NEW" : isSwitch ? "TOOL SWITCHED" : isRemoved ? "REMOVED" : "";
  if (!label) return "";
  const color = forbid ? ROSE : isNew ? CYAN : AMBER;
  const w = label.length * 7.4 + 22;
  const x = rightX - w - 8;
  const y = cardY - 9;
  return `<g class="badge ${forbid ? "forbid" : isNew ? "new" : "switch"}"><rect x="${x}" y="${y - 9}" width="${w}" height="18" rx="9" fill="${CANVAS}" stroke="${color}" stroke-opacity="0.9" stroke-width="1.2"/><text x="${x + w / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="9.5" font-weight="700" letter-spacing="1.4" fill="${color}">${label}</text></g>`;
}

function cardSvg(
  x: number,
  y: number,
  kind: RowKind,
  side: "old" | "new",
  step: StepInfo | undefined,
  index: number,
): string {
  if (!step) {
    return `<g class="node ghost"><rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="none" stroke="${BORDER}" stroke-opacity="0.7" stroke-width="1.2" stroke-dasharray="5 5"/><text x="${x + CARD_W / 2}" y="${y + CARD_H / 2}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="${DIM}">—</text></g>`;
  }
  const st = stateStyle(kind, side);
  const tc = toolColor(step.tool);
  const dim = kind === "same";
  const cls = dim
    ? "node dim"
    : kind === "forbidden"
      ? "node forbid"
      : kind === "new" || kind === "removed" || kind === "switch"
        ? "node hl"
        : "node";
  const nameColor = kind === "forbidden" ? ROSE : INK;
  const fileColor = kind === "forbidden" ? ROSE : DIM;
  const tileX = x + 16;
  const tileY = y + (CARD_H - 44) / 2;
  const fileRow = step.file
    ? `<text x="${x + 78}" y="${y + 58}" font-size="11.5" fill="${fileColor}" fill-opacity="${kind === "forbidden" ? 0.85 : 1}">${escapeHtml(shortFile(step.file))}</text>`
    : "";
  return `<g class="${cls}" opacity="${st.groupOp}"><rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="14" fill="#0B1120" fill-opacity="0.78" stroke="${st.border}" stroke-opacity="${st.borderOp}" stroke-width="1.5"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/><g class="tile"><rect x="${tileX}" y="${tileY}" width="44" height="44" rx="11" fill="${tc}" fill-opacity="0.14" stroke="${tc}" stroke-opacity="0.38" stroke-width="1"/><svg x="${tileX + 10}" y="${tileY + 10}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${tc}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths(step.tool)}</svg></g><text x="${x + 78}" y="${y + 36}" font-size="17" font-weight="600" fill="${nameColor}">${escapeHtml(step.tool)}</text>${fileRow}<text x="${x + CARD_W - 14}" y="${y + 26}" text-anchor="end" font-size="10" fill="${DIM}" opacity="0.8">${String(index + 1).padStart(2, "0")}</text>${badgeSvg(kind, side, x + CARD_W, y)}</g>`;
}

function columnHeader(cx: number, title: string, sub: string): string {
  return `<text x="${cx}" y="74" text-anchor="middle" font-size="21" font-weight="700" letter-spacing="2.2" fill="${INK}">${escapeHtml(title)}</text><text x="${cx}" y="98" text-anchor="middle" font-size="11.5" letter-spacing="0.6" fill="${DIM}">${escapeHtml(sub)}</text>`;
}

function pillSvg(cx: number, cy: number, w: number, text: string, color: string, strong: boolean): string {
  const h = 32;
  const pulse = strong
    ? `<animate attributeName="stroke-opacity" values="0.65;1;0.65" dur="2.2s" repeatCount="indefinite"/>`
    : "";
  return `<g><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="#F8FAFC" fill-opacity="0.05" stroke="${color}" stroke-opacity="${strong ? 0.65 : 0.16}" stroke-width="1.2">${pulse}</rect><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" letter-spacing="0.8" fill="${color}">${escapeHtml(text)}</text></g>`;
}

function renderScene(
  oldSteps: StepInfo[],
  newSteps: StepInfo[],
  forbidden: Set<number>,
  verdict: { word: string; color: string },
): { svg: string; height: number } {
  const maxN = Math.max(oldSteps.length, newSteps.length);
  const y0 = columnY0(maxN);
  const H = Math.max(y0 + 250, 560);

  const kindLeft = (i: number): RowKind => {
    const o = oldSteps[i];
    const n = newSteps[i];
    if (!o) return "new"; // ghost card — kind unused
    if (!n) return "removed";
    if (o.tool !== n.tool || (o.file ?? "").toLowerCase() !== (n.file ?? "").toLowerCase())
      return "switch";
    return "same";
  };
  const kindRight = (i: number): RowKind => {
    const o = oldSteps[i];
    const n = newSteps[i];
    if (!n) return "removed"; // ghost card — kind unused
    if (forbidden.has(i)) return "forbidden";
    if (!o) return "new";
    if (o.tool !== n.tool || (o.file ?? "").toLowerCase() !== (n.file ?? "").toLowerCase())
      return "switch";
    return "same";
  };

  const leftX = 48;
  const rightX = STAGE_W - 48 - CARD_W;
  const leftCx = leftX + CARD_W / 2;
  const rightCx = rightX + CARD_W / 2;
  const orb: Pt = [STAGE_W / 2, y0];

  const parts: string[] = [];

  // defs — gradients
  parts.push(
    `<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#38BDF8"/><stop offset="0.5" stop-color="#818CF8"/><stop offset="1" stop-color="#C084FC"/></linearGradient><radialGradient id="og"><stop offset="0" stop-color="#7C3AED" stop-opacity="0.5"/><stop offset="0.55" stop-color="#6D28D9" stop-opacity="0.16"/><stop offset="1" stop-color="#6D28D9" stop-opacity="0"/></radialGradient><radialGradient id="cg"><stop offset="0" stop-color="#231A4A"/><stop offset="1" stop-color="#0D1126"/></radialGradient><radialGradient id="bg1"><stop offset="0" stop-color="#3B82F6" stop-opacity="0.22"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/></radialGradient><radialGradient id="bg2"><stop offset="0" stop-color="#A78BFA" stop-opacity="0.22"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0"/></radialGradient></defs>`,
  );

  // ambient side glows
  parts.push(`<ellipse cx="${leftCx + 180}" cy="${y0}" rx="430" ry="175" fill="url(#bg1)"/>`);
  parts.push(`<ellipse cx="${rightCx - 180}" cy="${y0}" rx="430" ry="175" fill="url(#bg2)"/>`);

  // faint star field
  for (let s = 0; s < 46; s++) {
    const x = rnd(s * 3.1 + 5) * STAGE_W;
    const y = 20 + rnd(s * 7.7 + 2) * (H - 40);
    const r = 0.7 + 1.1 * rnd(s * 11.3 + 9);
    const op = 0.08 + 0.22 * rnd(s * 17.9 + 4);
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#94A3B8" opacity="${op.toFixed(2)}"/>`);
  }

  // column sequence connectors (step order inside each run)
  for (const [cx, steps] of [
    [leftCx, oldSteps],
    [rightCx, newSteps],
  ] as const) {
    for (let i = 0; i < steps.length - 1; i++) {
      const yA = columnY0(steps.length) + (i - (steps.length - 1) / 2) * PITCH + CARD_H / 2;
      const yB = yA + PITCH;
      parts.push(
        `<line x1="${cx}" y1="${yA + 6}" x2="${cx}" y2="${yB - 6}" stroke="${BORDER}" stroke-width="1.5" stroke-dasharray="3 7" stroke-opacity="0.9" class="flowdash" style="animation-duration:2.2s"/><circle cx="${cx}" cy="${yA + 6}" r="2.4" fill="${BORDER}"/><circle cx="${cx}" cy="${yB - 6}" r="2.4" fill="${BORDER}"/>`,
      );
    }
  }

  // streams: baseline → engine
  for (let i = 0; i < oldSteps.length; i++) {
    const kind = kindLeft(i);
    const color = kind === "removed" || kind === "switch" ? AMBER : BLUE;
    const intensity = kind === "same" ? 0.62 : 1;
    const cy = columnY0(oldSteps.length) + (i - (oldSteps.length - 1) / 2) * PITCH;
    const ay = y0 + (i - (oldSteps.length - 1) / 2) * ANCHOR_PITCH;
    const p0: Pt = [leftX + CARD_W, cy];
    const p3: Pt = [orb[0] - ORB_R - ANCHOR_DX, ay];
    parts.push(streamSvg(p0, p3, color, 11 + i * 101, intensity, kind === "same" ? [0.5] : [0.4, 0.62, 0.82]));
    parts.push(`<circle class="port" style="animation-delay:${(-(i * 0.7)).toFixed(2)}s" cx="${p0[0]}" cy="${p0[1]}" r="3.2" fill="${color}"/>`);
    parts.push(`<circle class="port" style="animation-delay:${(-(0.4 + i * 0.7)).toFixed(2)}s" cx="${p3[0]}" cy="${p3[1]}" r="3.6" fill="${CANVAS}" stroke="${color}" stroke-width="1.6"/>`);
  }
  // streams: engine → candidate
  for (let j = 0; j < newSteps.length; j++) {
    const kind = kindRight(j);
    const color = kind === "forbidden" ? ROSE : kind === "new" ? CYAN : kind === "switch" ? AMBER : VIOLET;
    const intensity = kind === "same" ? 0.62 : 1;
    const ay = y0 + (j - (newSteps.length - 1) / 2) * ANCHOR_PITCH;
    const cy = columnY0(newSteps.length) + (j - (newSteps.length - 1) / 2) * PITCH;
    const p0: Pt = [orb[0] + ORB_R + ANCHOR_DX, ay];
    const p3: Pt = [rightX, cy];
    parts.push(streamSvg(p0, p3, color, 47 + j * 53, intensity, kind === "same" ? [0.5] : [0.3, 0.52, 0.74]));
    parts.push(`<circle class="port" style="animation-delay:${(-(0.2 + j * 0.7)).toFixed(2)}s" cx="${p0[0]}" cy="${p0[1]}" r="3.6" fill="${CANVAS}" stroke="${color}" stroke-width="1.6"/>`);
    parts.push(`<circle class="port" style="animation-delay:${(-(0.6 + j * 0.7)).toFixed(2)}s" cx="${p3[0]}" cy="${p3[1]}" r="3.2" fill="${color}"/>`);
  }

  // engine orb — breathing glow, rotating dashed ring, orbiting satellites
  parts.push(`<circle cx="${orb[0]}" cy="${y0}" r="230" fill="url(#og)"><animate attributeName="opacity" values="0.72;1;0.72" dur="4.5s" repeatCount="indefinite"/></circle>`);
  parts.push(`<circle cx="${orb[0]}" cy="${y0}" r="${ORB_R + 38}" fill="none" stroke="#38BDF8" stroke-opacity="0.14" stroke-width="1"/>`);
  parts.push(`<circle cx="${orb[0]}" cy="${y0}" r="${ORB_R + 18}" fill="none" stroke="${VIOLET}" stroke-opacity="0.32" stroke-width="1.2" stroke-dasharray="2 10"><animateTransform attributeName="transform" type="rotate" from="0 ${orb[0]} ${y0}" to="360 ${orb[0]} ${y0}" dur="26s" repeatCount="indefinite"/></circle>`);
  parts.push(`<g><animateTransform attributeName="transform" type="rotate" from="360 ${orb[0]} ${y0}" to="0 ${orb[0]} ${y0}" dur="19s" repeatCount="indefinite"/>`);
  for (const [deg, c] of [
    [40, "#38BDF8"],
    [160, VIOLET],
    [285, CYAN],
  ] as const) {
    const rad = (deg * Math.PI) / 180;
    parts.push(
      `<circle cx="${(orb[0] + (ORB_R + 18) * Math.cos(rad)).toFixed(1)}" cy="${(y0 + (ORB_R + 18) * Math.sin(rad)).toFixed(1)}" r="3" fill="${c}" opacity="0.9"/>`,
    );
  }
  parts.push(`</g>`);
  parts.push(`<circle cx="${orb[0]}" cy="${y0}" r="${ORB_R}" fill="url(#cg)" stroke="url(#rg)" stroke-width="2.5"><animate attributeName="stroke-opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite"/></circle>`);

  // engine pills: the observable delta
  const pw = 186;
  parts.push(pillSvg(orb[0], y0 - 52, pw, `${oldSteps.length} → ${newSteps.length} calls`, INK, false));
  const oldFiles = new Set(oldSteps.map((s) => s.file).filter(Boolean));
  const newFiles = new Set(newSteps.map((s) => s.file).filter(Boolean));
  parts.push(pillSvg(orb[0], y0 - 10, pw, `${oldFiles.size} → ${newFiles.size} files`, INK, false));
  parts.push(pillSvg(orb[0], y0 + 32, pw, verdict.word, verdict.color, true));

  // engine glyph, floating above the ring
  const gy = y0 - ORB_R - 30;
  parts.push(
    `<circle cx="${orb[0]}" cy="${gy}" r="17" fill="#0B1120" stroke="url(#rg)" stroke-width="1.4"/><svg x="${orb[0] - 11}" y="${gy - 11}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${SWAP_ICON}</svg>`,
  );

  // cards
  for (let i = 0; i < maxN; i++) {
    const y = columnY0(maxN) + (i - (maxN - 1) / 2) * PITCH - CARD_H / 2;
    parts.push(cardSvg(leftX, y, kindLeft(i), "old", oldSteps[i], i));
    parts.push(cardSvg(rightX, y, kindRight(i), "new", newSteps[i], i));
  }

  // column headers
  parts.push(columnHeader(leftCx, "OLD RUN", "recorded baseline"));
  parts.push(columnHeader(orb[0], "BEHAVIOR ENGINE", "same task · two runs"));
  parts.push(columnHeader(rightCx, "NEW RUN", "recorded candidate"));

  const svg = `<svg class="scene" viewBox="0 0 ${STAGE_W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" style="font-family:var(--mono);display:block;width:100%;height:auto">${parts.join("")}</svg>`;
  return { svg, height: H };
}

const CSS = `
  :root { color-scheme: dark; --canvas:${CANVAS}; --mask:${MASK}; --ink:${INK}; --muted:${MUTED}; --dim:${DIM};
          --border:${BORDER}; --cyan:${CYAN}; --rose:${ROSE}; --green:${GREEN}; --amber:${AMBER};
          --mono:"JetBrains Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace; }
  * { box-sizing: border-box; }
  html, body { margin:0; min-height:100%; background:var(--canvas); color:var(--ink);
               font-family:var(--mono); font-size:13px; line-height:1.5; -webkit-font-smoothing:antialiased;
               background-image: radial-gradient(circle at 1px 1px, rgba(148,163,184,.09) 1px, transparent 0);
               background-size:18px 18px; }
  .wrap { max-width:1480px; margin:0 auto; padding:44px 36px 60px; }

  header { display:flex; align-items:baseline; justify-content:space-between; gap:16px;
           padding-bottom:20px; border-bottom:1px solid var(--border); }
  header h1 { margin:0; font-size:14px; font-weight:700; }
  header .brand { color:var(--cyan); }
  header .name { color:var(--ink); font-weight:600; }
  header .meta { font-size:11px; color:var(--dim); text-align:right; }

  .verdict { margin:16px 0 0; font-size:12px; letter-spacing:.02em; }
  .verdict.rose { color:var(--rose); } .verdict.green { color:var(--green); } .verdict.amber { color:var(--amber); }

  .board { margin-top:24px; border:1px solid var(--border); border-radius:14px;
           background:rgba(2,6,23,.5); overflow:hidden; }
  .board > .runrow { display:block; }
  .scene-legend { display:flex; justify-content:center; align-items:center; gap:10px;
                  padding:13px 0 4px; font-size:11px; color:var(--dim); }
  .scene-legend b { font-weight:600; }
  .scene-legend .o { color:#60A5FA; } .scene-legend .n { color:#C084FC; }
  .scene-legend .e { color:var(--muted); }
  .scene-legend .arr { opacity:.6; }

  /* rate orbit lanes */
  .board .rates-pad { padding:20px 18px 18px; }
  .lane { display:flex; align-items:center; margin-bottom:16px; }
  .lane:last-child { margin-bottom:0; }
  .lane-label { flex:0 0 auto; width:86px; font-size:9.5px; font-weight:700; letter-spacing:.12em;
                text-transform:uppercase; color:var(--dim); text-align:right; padding-right:14px; }
  .lane-label.new { color:var(--cyan); }
  .runrow { display:grid; align-items:stretch; }
  .runrow.rates { min-width:620px; }
  .rates-scroll { overflow-x:auto; }

  .badge { position:absolute; top:-9px; right:12px; font-size:8.5px; font-weight:700; letter-spacing:.08em;
           text-transform:uppercase; padding:2px 8px; border-radius:999px; background:var(--canvas); }
  .badge.forbid { color:var(--rose); border:1px solid var(--rose); }
  .badge.switch { color:var(--amber); border:1px solid var(--amber); }

  .asrt { position:relative; z-index:1; width:100%; min-width:0; min-height:128px;
          display:flex; flex-direction:column; justify-content:center; gap:5px;
          padding:13px 15px; border:1px solid var(--border); border-left-width:3px; border-radius:11px;
          background:linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.72)); }
  /* circuit ports joining the spine */
  .asrt::before, .asrt::after { content:""; position:absolute; top:50%; width:7px; height:7px; margin-top:-3.5px;
                                border-radius:50%; background:var(--canvas); border:1.5px solid #334155; z-index:2; }
  .asrt::before { left:-4.5px; } .asrt::after { right:-4.5px; }
  .asrt.forbid::before, .asrt.forbid::after { border-color:rgba(251,113,133,.85); box-shadow:0 0 6px rgba(251,113,133,.55); }
  .asrt.warn::before, .asrt.warn::after { border-color:rgba(251,191,36,.85); }
  .asrt.warn { border-color:rgba(251,191,36,.55); border-left-color:var(--amber); }
  .asrt.forbid { border-color:rgba(251,113,133,.6); border-left-color:var(--rose); }
  .asrt .k { font-size:8px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); }
  .asrt.warn .k { color:var(--amber); }
  .asrt.forbid .k { color:var(--rose); }
  .asrt .x { font-size:13.5px; font-weight:700; color:var(--ink); line-height:1.25; word-break:break-word; }
  .asrt.forbid .x { color:var(--rose); }
  .asrt .sub { font-size:9.5px; color:var(--dim); letter-spacing:.02em; }
  .asrt-body { display:grid; grid-template-columns:1fr 74px; gap:12px; align-items:center; margin-top:3px; }
  .asrt .sides { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .asrt .side { display:flex; align-items:center; gap:8px; font-size:10.5px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .asrt .side .lbl { flex:0 0 30px; font-size:8.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); }
  .asrt .side b { font-weight:700; color:var(--ink); min-width:36px; }
  .asrt .side.cand b { color:#C084FC; }
  .asrt.forbid .side.cand b { color:var(--rose); }
  .asrt.warn .side.cand b { color:var(--amber); }
  .slope { width:74px; height:44px; display:block; overflow:visible; }
  .slope .guide { stroke:#1E293B; stroke-width:1; stroke-dasharray:2 4; }
  .slopepulse { animation:slopeglow 2s ease-in-out infinite; }
  @keyframes slopeglow { 0%,100% { opacity:1; } 50% { opacity:.55; } }
  .rates-spine { position:absolute; left:0; right:0; top:50%; height:2px; z-index:0; width:100%; display:block; }
  .rates-spine line { stroke:#1E293B; stroke-width:2; stroke-dasharray:4 9; animation:dashflow 1.6s linear infinite; }
  .ticks { display:flex; flex-wrap:wrap; gap:2.5px; margin-left:auto; }
  .tick { width:7px; height:11px; flex-shrink:0; border-radius:2px; background:#1E293B; }
  .tick.fail { background:var(--rose); box-shadow:0 0 6px rgba(251,113,133,.5); }

  .totals { margin-top:24px; padding-top:12px; border-top:1px solid var(--border);
            display:flex; justify-content:space-between; gap:16px; font-size:11px; color:var(--dim); }
  .totals b { color:var(--muted); font-weight:600; }

  /* evaluation ledger — the verdict, row by row */
  .ledger { margin-top:22px; border:1px solid var(--border); border-radius:12px; overflow:hidden;
            background:rgba(2,6,23,.5); }
  .lg-row { display:grid; grid-template-columns:150px 1fr 120px 150px; align-items:center; gap:12px;
            padding:9px 16px; border-top:1px solid rgba(30,41,59,.55); font-size:11.5px; }
  .lg-row:first-of-type { border-top:none; }
  .lg-head { display:grid; grid-template-columns:150px 1fr 120px 150px; gap:12px; padding:10px 16px;
             font-size:8.5px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--dim);
             border-bottom:1px solid var(--border); background:rgba(15,23,42,.4); }
  .lg-kind { color:var(--muted); font-weight:600; }
  .lg-exp { color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lg-cell { font-weight:700; letter-spacing:.04em; }
  .lg-cell.pass { color:var(--green); }
  .lg-cell.fail { color:var(--rose); }
  .lg-row.reg { background:rgba(251,113,133,.07); }
  .lg-row.reg .lg-exp, .lg-row.reg .lg-kind { color:var(--ink); }
  .lg-note { padding:7px 16px; font-size:9.5px; color:var(--dim); border-top:1px solid rgba(30,41,59,.55); }
  @media (max-width:700px){ .lg-row, .lg-head { grid-template-columns:1fr 90px 90px; }
    .lg-head span:nth-child(2), .lg-row .lg-exp { display:none; } }

  /* declarative motion — current flows, ports blink, failures breathe */
  .flowdash { animation: dashflow 1.5s linear infinite; }
  @keyframes dashflow { to { stroke-dashoffset: -40; } }
  .port { animation: portblink 2.6s ease-in-out infinite; }
  @keyframes portblink { 0%,100% { opacity:.4; } 50% { opacity:1; } }
  .tick.fail { animation: tickpulse 2.2s ease-in-out infinite; }
  @keyframes tickpulse { 0%,100% { opacity:1; } 50% { opacity:.55; } }
  @media (prefers-reduced-motion: reduce) {
    .flowdash, .port, .tick.fail, .rates-spine line, .slopepulse { animation: none !important; }
  }

  @media (max-width:700px){ .wrap{ padding:26px 12px 40px; } .scene-legend{ flex-wrap:wrap; } }
`;

/** Build the self-contained HTML for two recorded traces. */
export async function renderOrbit(oldPath: string, newPath: string, opts: OrbitOptions = {}): Promise<string> {
  const oldTrace = await loadRecordedTrace(oldPath);
  const newTrace = await loadRecordedTrace(newPath);
  const oldRun = toRunTrace(oldTrace);
  const newRun = toRunTrace(newTrace);
  const { expect: contract, derived } = deriveExpect(oldTrace, newTrace, opts.expect);
  const ledgerRows = buildLedger(oldRun, newRun, contract);

  const oldFiles = oldTrace.filesChanged ?? [];
  const newFiles = newTrace.filesChanged ?? [];

  const novelFiles = newFiles.filter((f) => !oldFiles.some((o) => o.toLowerCase() === f.toLowerCase()));
  const oldSteps = describeSteps(oldTrace, oldFiles);
  const newSteps = describeSteps(newTrace, newFiles, novelFiles);

  const novelStepIndexes = novelFiles
    .map((file) => newSteps.findIndex((s) => s.input.toLowerCase().includes(file.toLowerCase())))
    .filter((i) => i >= 0);
  const forbidden = new Set(novelStepIndexes);

  let forkIndex: number | null = null;
  const common = Math.min(oldSteps.length, newSteps.length);
  for (let i = 0; i < common; i++) {
    if (oldSteps[i].tool !== newSteps[i].tool) {
      forkIndex = i;
      break;
    }
  }

  const verdict = novelFiles.length
    ? `\u2717 REGRESSION \u2014 new run touches ${novelFiles.join(", ")}`
    : forkIndex !== null
      ? `\u26A0 DIVERGENCE \u2014 different tool at step ${forkIndex + 1}`
      : "\u2713 COMPATIBLE \u2014 no observable behavior change";
  const verdictCls = novelFiles.length ? "rose" : forkIndex !== null ? "amber" : "green";
  const verdictWord = novelFiles.length ? "REGRESSION" : forkIndex !== null ? "DIVERGENCE" : "COMPATIBLE";
  const verdictColor = novelFiles.length ? ROSE : forkIndex !== null ? AMBER : GREEN;

  const { svg } = renderScene(oldSteps, newSteps, forbidden, { word: verdictWord, color: verdictColor });

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>skilldiff \u00B7 ${escapeHtml(opts.name ?? "behavior orbit")}</title>
<style>${CSS}</style>
</head><body>
<main class="wrap">

<header>
  <h1><span class="brand">skilldiff</span> <span class="name">\u00B7 ${escapeHtml(opts.name ?? "behavior orbit")}</span></h1>
  <div class="meta">recorded behavior diff<br/>same task, two runs</div>
</header>

<div class="verdict ${verdictCls}">${verdict}</div>

<div class="board">
  <div class="runrow">${svg}</div>
  <div class="scene-legend"><b class="o">old run</b><span class="arr">\u2192</span><span class="e">behavior engine</span><span class="arr">\u2192</span><b class="n">new run</b></div>
</div>

${ledgerHTML(ledgerRows, derived)}

<div class="totals">
  <span>old <b>\u00B7</b> ${oldTrace.toolCalls.length} calls \u00B7 ${oldFiles.length} file${oldFiles.length === 1 ? "" : "s"}</span>
  <span>new <b>\u00B7</b> ${newTrace.toolCalls.length} calls \u00B7 ${newFiles.length} file${newFiles.length === 1 ? "" : "s"}</span>
</div>

</main>
</body></html>
`;

  return html;
}

/** Generate + write the orbit HTML, returning the output path. */
export async function writeOrbit(oldPath: string, newPath: string, opts: OrbitOptions = {}): Promise<void> {
  const out = resolve(opts.out ?? "orbit.html");
  const html = await renderOrbit(oldPath, newPath, opts);
  await writeFile(out, html, "utf8");
}

// ─── Rate orbit: Monte Carlo batch (empirical failure rates) ────────────────

export interface RateOrbitOptions extends OrbitOptions {
  /** One recorded trace path per baseline run (repeat the same path for reproducibility). */
  oldTraces: string[];
  /** One recorded trace path per candidate run. */
  newTraces: string[];
  /** The scenario expectations — each assertion becomes one card. */
  expect: Expectations;
  tolerance?: number;
  floor?: number;
}

async function sidesFromPaths(paths: string[], label: string, expect: Expectations): Promise<SideResult[]> {
  const out: SideResult[] = [];
  for (const p of paths) {
    const t = await loadRecordedTrace(p);
    const trace = buildTrace({
      toolCalls: t.toolCalls,
      output: t.output ?? "",
      filesChanged: t.filesChanged,
      warnings: t.warnings,
    });
    out.push({ label, trace, assertions: evaluateAssertions(trace, expect) });
  }
  return out;
}

function tickCells(fails: number, n: number): string {
  let s = '<div class="ticks">';
  for (let i = 0; i < n; i++) s += `<span class="tick${i < fails ? " fail" : ""}"></span>`;
  return s + "</div>";
}

/** Assertion jargon → what it means in human words. */
function humanizeAssertion(kind: string, expected: string): { title: string; sub: string } {
  switch (kind) {
    case "must_not": {
      const m = expected.match(/^(\S+) does not include (.+)$/);
      const subs: Record<string, string> = {
        files_changed: "must not be touched",
        commands_run: "must never be run",
        tool_calls: "must not be used",
      };
      return m
        ? { title: m[2], sub: subs[m[1]] ?? "forbidden" }
        : { title: expected, sub: "forbidden" };
    }
    case "files_changed":
      return { title: expected, sub: "must be changed" };
    case "commands_run":
      return { title: expected, sub: "command must run" };
    case "tool_calls":
      return { title: expected, sub: "tool must be used" };
    case "output_contains":
      return { title: `\u201C${expected}\u201D`, sub: "must appear in output" };
    default:
      return { title: expected, sub: kind };
  }
}

function rateCard(
  a: BatchAssertion,
  old: BatchAssertion | undefined,
  status: "block" | "warn" | "stable",
): string {
  const cls = status === "block" ? " forbid" : status === "warn" ? " warn" : "";
  const badge =
    status === "block"
      ? '<span class="badge forbid">REGRESSION</span>'
      : status === "warn"
        ? '<span class="badge switch">RISK</span>'
        : "";
  const { title, sub } = humanizeAssertion(a.kind, a.expected);
  const oldStr = old ? `${old.fails}/${old.n}` : "\u2013";
  const slopeColor = status === "block" ? ROSE : status === "warn" ? AMBER : "#475569";
  const y = (r: number) => (40 - 6 - r * 28).toFixed(1);
  const yb = y(old ? old.rate : 0);
  const yc = y(a.rate);
  const slope = `<svg class="slope" viewBox="0 0 74 44" aria-hidden="true"><line class="guide" x1="6" x2="68" y1="${yb}" y2="${yb}"/><line class="guide" x1="6" x2="68" y1="${yc}" y2="${yc}"/><path d="M6,${yb} C28,${yb} 46,${yc} 68,${yc}" fill="none" stroke="${slopeColor}" stroke-width="2" stroke-linecap="round"${status === "block" ? ' class="slopepulse"' : ""}/><circle cx="6" cy="${yb}" r="3" fill="#64748B"/><circle cx="68" cy="${yc}" r="3.5" fill="${slopeColor}"/></svg>`;
  return `<div class="asrt${cls}">${badge}<span class="k">${escapeHtml(a.kind)}</span><span class="x">${escapeHtml(title)}</span><span class="sub">${escapeHtml(sub)}</span><div class="asrt-body"><div class="sides"><div class="side"><span class="lbl">base</span><b>${oldStr}</b>${tickCells(old ? old.fails : 0, old ? old.n : a.n)}</div><div class="side cand"><span class="lbl">cand</span><b>${a.fails}/${a.n}</b>${tickCells(a.fails, a.n)}</div></div>${slope}</div></div>`;
}

/** Build the self-contained HTML for a Monte Carlo batch of N runs per side. */
export async function renderRateOrbit(opts: RateOrbitOptions): Promise<string> {
  const tolerance = opts.tolerance ?? 0.1;
  const floor = opts.floor ?? 0.2;

  const oldSides = await sidesFromPaths(opts.oldTraces, "baseline", opts.expect);
  const newSides = await sidesFromPaths(opts.newTraces, "candidate", opts.expect);

  const oldAgg = aggregateBatch(oldSides);
  const newAgg = aggregateBatch(newSides);
  const regressions = detectBatchRegressions(oldAgg, newAgg, { tolerance, floor });

  const oldMap = new Map(oldAgg.assertions.map((a) => [`${a.kind}\u0000${a.expected}`, a]));
  const blocked = regressions.filter((r) => r.blocked);
  const warn = regressions.filter((r) => !r.blocked);
  const regKey = (r: BatchRegression) => `${r.kind}\u0000${r.expected}`;
  const n = newAgg.n;

  const verdict = blocked.length
    ? `\u2717 REGRESSION \u2014 ${blocked.length} assertion${blocked.length > 1 ? "s" : ""} failed ${blocked[0]?.newRate !== undefined ? Math.round((blocked[0]?.newRate ?? 0) * 100) : 0}%+ of ${n} candidate runs`
    : warn.length
      ? `\u26A0 REGRESSION RISK \u2014 ${warn.length} assertion${warn.length > 1 ? "s" : ""} moved above tolerance`
      : `\u2713 STEADY \u2014 no failure rate moved across ${n} candidate runs`;
  const verdictCls = blocked.length ? "rose" : warn.length ? "amber" : "green";

  const cards = newAgg.assertions.map((a) => {
    const o = oldMap.get(`${a.kind}\u0000${a.expected}`);
    const reg = regressions.find((r) => regKey(r) === `${a.kind}\u0000${a.expected}`);
    const status: "block" | "warn" | "stable" = reg ? (reg.blocked ? "block" : "warn") : "stable";
    return rateCard(a, o, status);
  });

  const cols = newAgg.assertions.length;
  const grid = `style="grid-template-columns:repeat(${cols}, minmax(0,1fr))"`;

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>skilldiff \u00B7 ${escapeHtml(opts.name ?? "failure-rate orbit")}</title>
<style>${CSS}</style>
</head><body>
<main class="wrap">

<header>
  <h1><span class="brand">skilldiff</span> <span class="name">\u00B7 ${escapeHtml(opts.name ?? "failure-rate orbit")}</span></h1>
  <div class="meta">${escapeHtml(oldAgg.label)} \u00D7 ${oldAgg.n} \u00B7 ${escapeHtml(newAgg.label)} \u00D7 ${newAgg.n}<br/>failure rate \u2014 gate \u2265 ${Math.round(floor * 100)}%, delta &gt; ${Math.round(tolerance * 100)} pts</div>
</header>

<div class="verdict ${verdictCls}">${verdict}</div>

<div class="board">
  <div class="rates-pad rates-scroll">
    <div class="runrow rates" ${grid}>
      <svg class="rates-spine" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="1" x2="100%" y2="1"/></svg>
      ${cards.join("")}
    </div>
  </div>
</div>

<div class="totals">
  <span>${oldAgg.n} baseline run${oldAgg.n > 1 ? "s" : ""} <b>\u00B7</b> each tick is one run; rose = failed</span>
  <span>${newAgg.n} candidate run${newAgg.n > 1 ? "s" : ""} <b>\u00B7</b> ${blocked.length} blocked / ${warn.length} at risk</span>
</div>

</main>
</body></html>
`;

  return html;
}

/** Generate + write the rate-orbit HTML, returning the output path. */
export async function writeRateOrbit(opts: RateOrbitOptions): Promise<void> {
  const out = resolve(opts.out ?? "orbit.html");
  const html = await renderRateOrbit(opts);
  await writeFile(out, html, "utf8");
}
