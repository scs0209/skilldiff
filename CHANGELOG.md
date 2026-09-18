# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Behavior diff report with automatic REGRESSION annotation (old passed, new fails)
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
