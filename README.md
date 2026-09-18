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

Text diffs don't answer "what will the agent do differently?" This does:

```
- with old skill: agent created PLAN.md, ran npm test
+ with new skill: agent created TODO.md, never ran tests   ✗ REGRESSION
```

Unlike prompt testers or skill collections, skilldiff asserts on **observable behavior** — deterministically, on every PR.

## Quickstart

```bash
git clone https://github.com/scs0209/skilldiff.git && cd skilldiff
npm install && npm test   # no API key needed for development
```

Describe what your skill should do:

```yaml
# notes-helper.scenario.yaml
name: notes-helper
skillPaths: [".claude/skills/notes-helper/SKILL.md"]
fixture: ./examples/fixture
prompt: Read NOTES.md and follow the instructions in it.
expect:
  files_changed: [NOTES.md]
  tool_calls: [read, write]
  must_not:
    commands_run: ["rm -rf"]
  output_contains: ["SPIKE RAN OK"]
```

Run it — recorded mode is free and deterministic:

```bash
skilldiff run notes-helper.scenario.yaml \
  --old traces/old.json --new traces/new.json
```

Or **live** on your own agent account (Freebuff works out of the box — it uses your desktop login):

```bash
skilldiff run notes-helper.scenario.yaml --live --base origin/main
# fetches the OLD skill from main, runs old + new, posts the behavior diff
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
 │  (Freebuff · Cursor · Codex · Claude Code)  │
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
   PR comment:  ✓ read   ✓ write   ✗ REGRESSION: created TODO.md, never ran tests
```

## Harnesses — run on your own account

No shared API key. Each contributor uses the harness they already have:

| Harness | Auth | Status |
|---|---|---|
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
| `npm test` | unit tests — no API key needed |
| `npm run spike` | live harness auto-detect + trace capture check |
| `npm run spike:recorded` | parser replay against recorded traces (no quota) |
| `npm run spike:freebuff` | live Freebuff run on a minimal fixture |
| `skilldiff run <scenario> [flags]` | run a behavior diff |

## Design

Design decisions, rejected alternatives, and cost caps: [`docs/design-decisions.md`](docs/design-decisions.md).

TL;DR — run old + new every PR (no caching in v0.1), exactly 5 partial-match assertion kinds in plain YAML, deterministic recorded traces for CI with live LLM runs only where you opt in.

## Contributing

Contributions welcome — harness adapters, assertion ideas, real-world example scenarios, docs. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Please note our [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md) (not via public issues).

## License

[MIT](LICENSE)
