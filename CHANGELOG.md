# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `skilldiff orbit <old.json> <new.json>` — renders any two recorded runs as a
  self-contained "behavior orbit": a behavior-engine scene where the old run's
  tool calls enter a glowing diff orb from the left, the new run's exit right,
  joined by particle bezier streams. The orb's pills carry the observable
  delta (calls, files, verdict); a card only stands out when behavior actually
  changes (`NEW`, `REMOVED`, `TOOL SWITCHED`, `FORBIDDEN` badges). Color is
  semantic only. Motion is declarative (SMIL/CSS packets riding the streams,
  breathing orb, blinking ports) — zero JS, one self-contained page.
  - Evaluation ledger under the scene: both runs are graded against the
    contract (scenario `expect`, or derived from the old run when omitted) and
    every assertion shows baseline ✓/✗ vs candidate ✓/✗ — regressions are
    named, not implied. `--scenario <s.yaml>` injects expectations.
  - `--out orbit.html`, `--name "..."` flags
- `skilldiff orbit --old <a.json> … --old <n.json> --new <x.json> … --new <z.json>
  --scenario <s.yaml>` — "rate orbit": Monte Carlo batch visualization. Each
  assertion becomes a card carrying the empirical failure rate and one tick
  per run (rose = failed run), baseline lane on top, candidate lane below, so
  the distribution — not a single draw — is what gets read.
- `skilldiff run --repeat N` — Monte Carlo batch mode. A single run is a
  sample: if an edit introduces a ~15% probability of an unprompted tool
  branch, comparing one baseline run against one candidate run misses the
  regression >70% of the time. `--repeat N` runs each side N times, aggregates
  every assertion into an **empirical failure rate**, and compares
  rate-vs-rate (default gate: block at ≥20% failure, warn on any delta
  >10 pts). Recorded/CI replay stays deterministic (repeat is 0-variance by
  construction) — batched live runs are the oracle for tail-risk regressions.

### Planned
- Live verification for cursor-agent / codex / claude-code adapters (parsers done, quota-gated)
- `skilldiff record` command for capturing trace fixtures from live runs
- npm publish

## [0.1.0] — 2026-09-18

### Added
- Per-harness CLI adapters: Freebuff/Codebuff (live-verified), Cursor, Codex, Claude Code
- Scenario YAML loader with validation (`name`, `skillPaths`, `fixture`, `prompt`, `expect`)
- The 5 assertion kinds: `files_changed`, `commands_run`, `tool_calls`, `must_not`, `output_contains`
- Cross-harness tool-name normalization (`view_file`→`read`, `str_replace_editor`→`write`, …)
- Behavior diff report (Markdown) with an assertion ledger table — both runs
  graded per expectation, REGRESSION rows named explicitly — plus automatic
  old-passed/new-fails annotation
- Runner with two modes: recorded traces (deterministic CI) and live Freebuff runs
- Full baseline pipeline: `--base <ref>` fetches old skill via `git show`, injects
  both versions into the fixture, runs each, diffs behavior
- CLI: `skilldiff run <scenario.yaml> [--old t.json] [--new t.json] [--live] [--base <ref>]`
- Spikes: `spike` (live auto-detect), `spike:recorded` (parser replay), `spike:freebuff`
- GitHub Action: recorded scenarios on `skills/**` PRs with PR comment reporting;
  live mode gated behind manual `workflow_dispatch`
- 30 unit tests (scenario loader, assertions, report, baseline)

### Changed
- Runner decision superseded: "Claude Agent SDK directly" → per-harness CLI
  adapters, so contributors run on their own subscriptions (see
  `docs/design-decisions.md`)

## [0.0.1] — 2026-09-18

### Added
- Scaffold: spike gate script (T1 go/no-go), CLI entry, design decisions doc
