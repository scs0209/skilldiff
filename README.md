<div align="center">

# skilldiff

**Behavioral regression testing for agent skills.**

Change one line in a SKILL.md — know exactly what else changed.

[![CI](https://github.com/scs0209/skilldiff/actions/workflows/skilldiff.yml/badge.svg)](https://github.com/scs0209/skilldiff/actions/workflows/skilldiff.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4)](CONTRIBUTING.md)

*Runs your skill in a real agent harness against a fixture repo and asserts on what the agent actually did — files changed, commands run, tool calls.*

</div>

---

## The problem

You maintain agent skills. You edit one instruction line. Now every agent run that uses that skill may behave differently — and you find out from a user.

Text diffs don't answer "what will the agent do differently?" This does — here's a real report from skilldiff dogfooding itself (both skills appended `SPIKE RAN OK` to `NOTES.md`; the new version *also* created a `TODO.md` the scenario forbids — that's the regression skilldiff catches):

```
skilldiff behavior report — notes-helper

old skill: 2 tool calls, 1 file(s) changed, 0 command(s) run
  files: NOTES.md
new skill: 3 tool calls, 2 file(s) changed, 0 command(s) run
  files: NOTES.md, TODO.md

Assertions:
  ✓ [files_changed] NOTES.md
  ✓ [tool_calls] read
  ✓ [tool_calls] write
  ✗ [must_not] files_changed does not include TODO.md
      actual (new): VIOLATED — TODO.md was changed
      actual (old): changed: [NOTES.md]
      note: this is a REGRESSION — old skill passed, new skill fails
  ✓ [output_contains] SPIKE RAN OK

Result (new skill): 4 passed, 1 failed
```

Unlike prompt testers or skill collections, skilldiff asserts on **observable behavior** — deterministically, on every PR.

<img src="docs/assets/report-terminal.png" alt="skilldiff terminal report" width="720">

## Quickstart

No clone needed. From any repo that has skills:

```bash
npx skilldiff init     # scans .claude/skills/, skills/, .agents/skills/
                       # and generates a starter scenario per skill
```

```
Found 2 skill(s):

  notes-helper — Helps take notes
    .claude/skills/notes-helper/SKILL.md
  deploy — Deploys the app
    skills/deploy/SKILL.md

Created starter scenarios:
  skilldiff/notes-helper.scenario.yaml
  skilldiff/deploy.scenario.yaml
```

Point each scenario's `fixture` at a small repo the skill can safely operate on, strengthen `expect` to match real behavior, then run:

```bash
# Live on your own agent account (Freebuff works out of the box — uses your desktop login)
npx skilldiff run skilldiff/notes-helper.scenario.yaml --live --base origin/main
# fetches the OLD skill from main, runs old + new, prints the behavior diff

# Recorded mode — replay captured traces, free and deterministic (what CI uses)
npx skilldiff run skilldiff/notes-helper.scenario.yaml \
  --old traces/old.json --new traces/new.json
```

Want to hack on skilldiff itself?

```bash
git clone https://github.com/scs0209/skilldiff.git && cd skilldiff
npm install && npm test   # 30 unit tests, no API key needed
```

## How it works

```
 PR touches skills/**
        │
        ▼
 ┌─────────────────┐     git show base:SKILL.md
 │  baseline fetch  │ ────────────────────────────►  old skill version
 └─────────────────┘
        │
        ▼
 ┌─────────────────────────────────────────────┐
 │  run scenario twice in a real harness       │
 │  (opencode · Freebuff · Cursor · Codex)     │
 └─────────────────────────────────────────────┘
        │
        ▼
 ┌─────────────────┐
 │  trace capture   │  tool calls · files changed · commands · output
 └─────────────────┘
        │
        ▼
 ┌─────────────────┐
 │ 5 assertions     │  files_changed · commands_run · tool_calls
 │ + behavior diff  │  must_not · output_contains
 └─────────────────┘
        │
        ▼
   PR comment:  ✓ read   ✓ write   ✗ REGRESSION: also created TODO.md (forbidden)
```

On the PR, the report lands as a comment — real example from dogfooding:

<img src="docs/assets/report-pr.png" alt="skilldiff PR comment report" width="800">

## Harnesses — run on your own account

No shared API key. Each contributor uses the harness they already have:

| Harness | Auth | Status |
|---|---|---|
| opencode | existing agent session (used to produce the dogfood report above) | ✅ live-verified |
| Freebuff / Codebuff | Freebuff desktop token (auto-detected) or `CODEBUFF_API_KEY` | ✅ live-verified |
| Cursor | `cursor-agent` CLI login | parser verified |
| Codex | `codex exec` login | parser verified |
| Claude Code | `claude` CLI login | parser verified |

Missing your harness? [Open a harness request](https://github.com/scs0209/skilldiff/issues/new?template=harness_request.yml) — or better, [build the adapter](CONTRIBUTING.md#adding-a-harness-adapter). It's ~40 lines and the highest-value contribution type.

## CI

`.github/workflows/skilldiff.yml` ships with the repo:

- **On PRs touching `skills/**`** — recorded scenarios run deterministically (no secrets, no quota), report posts as a PR comment, failures gate the merge.
- **Manual dispatch with `live: true`** — additionally runs live scenarios against the base branch (uses credits; requires a `CODEBUFF_API_KEY` secret).

## The 5 assertion kinds

| Kind | Meaning | Matching |
|---|---|---|
| `files_changed` | paths the agent modified | partial (substring) |
| `commands_run` | commands executed | partial, case-insensitive |
| `tool_calls` | tools invoked (normalized across harnesses) | canonical name |
| `must_not` | forbidden files/commands/tools | inverted |
| `output_contains` | substrings in final output | partial, case-insensitive |

## Commands

| Command | Purpose |
|---|---|
| `npx skilldiff init [dir]` | discover skills, generate starter scenarios |
| `npx skilldiff run <scenario> [flags]` | run a behavior diff |
| `npm test` (dev) | unit tests — no API key needed |
| `npm run spike` (dev) | live harness auto-detect + trace capture check |
| `npm run spike:recorded` (dev) | parser replay against recorded traces (no quota) |
| `npm run spike:freebuff` (dev) | live Freebuff run on a minimal fixture |

## Design

Design decisions, rejected alternatives, and cost caps: [`docs/design-decisions.md`](docs/design-decisions.md).

TL;DR — run old + new every PR (no caching in v0.1), exactly 5 partial-match assertion kinds in plain YAML, deterministic recorded traces for CI with live LLM runs only where you opt in.

## Contributing

Contributions welcome — harness adapters, assertion ideas, real-world example scenarios, docs. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Please note our [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md) (not via public issues).

## License

[MIT](LICENSE)
