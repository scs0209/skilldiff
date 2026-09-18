# skilldiff

Behavioral regression testing for agent skills. Test your skills in CI with real harness runs and behavior diffs.

> Powered by Claude Agent SDK · Freebuff (Codebuff) · Cursor · Codex

Status: v0.1 core implemented. See `docs/design-decisions.md` for the design rationale.

## What it does

Change one line in a SKILL.md, open a PR, and CI shows you a behavioral diff:

```
- with old skill: agent created PLAN.md, ran npm test
+ with new skill: agent created TODO.md, never ran tests   ✗
```

Unlike existing skill collections and prompt testers, skilldiff runs your skill
inside a real agent harness against a fixture repo and asserts on what the agent
actually did — files changed, commands run, tool calls — deterministically.

## Harnesses — run on your own account

Each developer runs skilldiff with the harness they already have. No shared API key:

| Harness | Auth | Status |
|---|---|---|
| Freebuff / Codebuff | Freebuff desktop login token (auto-detected) or `CODEBUFF_API_KEY` | ✅ live |
| Cursor | `cursor-agent` CLI login | adapter ready |
| Codex | `codex exec` login | adapter ready |
| Claude Code | `claude` CLI login | adapter ready |

## Usage

### 1. Write a scenario

```yaml
# notes-helper.scenario.yaml
name: notes-helper
skillPaths:
  - .claude/skills/notes-helper/SKILL.md
fixture: ./examples/fixture
prompt: Read NOTES.md and follow the instructions in it.
expect:
  files_changed:
    - NOTES.md
  tool_calls:
    - read
    - write
  must_not:
    commands_run:
      - rm -rf
  output_contains:
    - SPIKE RAN OK
```

### 2. Run it

```bash
# Recorded mode — replay captured traces, deterministic, free (default for CI)
skilldiff run notes-helper.scenario.yaml \
  --old traces/notes-helper-old.json \
  --new traces/notes-helper-new.json

# Live mode — actually runs the agent via Freebuff (uses your Freebuff credits)
skilldiff run notes-helper.scenario.yaml --live

# Full pipeline — fetches the old skill from the base branch and diffs behavior
skilldiff run notes-helper.scenario.yaml --live --base origin/main
```

Exit code: 0 = all assertions pass on the new skill, 1 = behavior differs.

### 3. CI (GitHub Action)

`.github/workflows/skilldiff.yml` ships with the repo:
- **On PRs touching `skills/**`**: recorded scenarios run deterministically; the report posts as a PR comment.
- **Manual dispatch with `live: true`**: additionally runs live scenarios against the base branch (requires a `CODEBUFF_API_KEY` secret).

## The 5 assertion kinds

| Kind | Meaning | Matching |
|---|---|---|
| `files_changed` | paths the agent modified | partial (substring) |
| `commands_run` | commands executed | partial, case-insensitive |
| `tool_calls` | tools invoked (normalized across harnesses) | canonical name |
| `must_not` | forbidden files/commands/tools | inverted |
| `output_contains` | substrings in final output | partial, case-insensitive |

## Commands

```bash
npm run spike            # harness auto-detect + trace capture validation
npm run spike:recorded   # validate trace parsers without live quota
npm run spike:freebuff   # live Freebuff run on a minimal fixture
npm test                 # unit tests (scenario loader, assertions, report, baseline)
```

## Design docs

- `docs/design-decisions.md` — chosen approach, rejected alternatives, cost caps

## License

MIT
