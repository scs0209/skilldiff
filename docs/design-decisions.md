# skilldiff — Design Decisions

Compressed from the office-hours + eng-review session of 2026-09-18.
Full doc: `~/.gstack/projects/shopl-shopl-web-workspace/ayaan-featureSH-19107_-heatmap-design-20260918-074406.md`

## What this is

GitHub Action + CLI that runs agent skills headless against fixture repos on every
PR touching `skills/**`, asserts on observable behavior, and posts an old-vs-new
behavior diff as a PR comment.

## Locked decisions

- **Runner**: per-harness CLI adapters. Each developer runs skilldiff locally with
  the harness they already have — Claude Code (`claude -p --output-format
  stream-json`), Cursor (`cursor-agent -p --output-format stream-json`), Codex
  (`codex exec --json`). All three emit JSON event streams containing tool-use
  events; skilldiff normalizes them into one trace format.
  Supersedes the original "Claude Agent SDK directly" decision (2026-09-18):
  SDK-only forced every contributor to hold an Anthropic API key with credit;
  harness CLIs run on each user's own subscription/login.
  The Agent SDK becomes one adapter among several, not a dependency.
  Adapter is auto-detected from installed CLIs, overridable via flag.
- **Diff baseline**: run old + new skill every PR (no caching in v0.1).
  Per-scenario maxTurns 10 + $2/PR default cap, explicit override; cost shown
  in the PR comment.
- **Old-skill fetch**: `git show <base>:<path>` / `git checkout <base> -- <paths>`
  into a temp copy — validated by the spike.
- **Assertions**: exactly 5 observable kinds — files_changed, commands_run,
  tool_calls, must_not, output_contains — partial matching, plain YAML.
  LLM judge is an optional flag, labeled fuzzy.
- **Single run is a sample**: a one-shot baseline-vs-candidate diff compares two
  random draws from an unmapped distribution. If an edit introduces a ~15%
  probability of an unprompted tool branch, a single-run diff misses the
  regression over 70% of the time. So `skilldiff run --repeat N` runs each side
  N times and asserts on the **empirical failure rate** per assertion:
  candidate rate is compared against baseline rate (tolerance 0.1) and a
  flagged delta is a warn below 20% failure, a block at/above it. Recorded/CI
  mode is deterministic (repeat is 0-variance by construction) — which is
  exactly why it can't catch live-only, probabilistic regressions; batched live
  runs are the oracle for those. The rate orbit visualizes the same idea:
  failure-rate cards + per-run ticks, never a single clean draw.
- **Output gate (roadmap)**: for review workflows, a numeric gate on drafted
  output — score every draft against target features, warn below a threshold,
  flip warn to block once new output holds the line. Same instinct as
  trajectory diffing: don't trust a read-through, make the actual output pass a
  check before it ships.
- **Branding**: factual references + "powered by Claude Agent SDK" badge only.
  "Claude Code" naming in marketing is prohibited per Anthropic guidelines.
- **Testing**: unit (pure logic 100%), recorded-trace fixtures mocking the runner,
  demo-repo E2E; live LLM smoke nightly only.
- **Name**: `skilldiff` — locked 2026-09-18. GitHub exact-name 0, npm free.
  Rejected: skillproof (npm taken, 248 repos), skillprobe (direct competitor),
  skillbench/skillaudit (taken).

## Rejected alternatives

- Monitor/cockpit dashboards — occupied (1,007★ active project)
- Multi-agent orchestrators — occupied (2,224★)
- Session postmortem replay — weak retention, small incumbents
- promptfoo reuse — wrong abstraction level for harness-loaded skills

## NOT in scope (v0.1)

Baseline caching, LLM-judge scoring by default,
Action Marketplace listing, web playground.
