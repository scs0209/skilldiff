# skilldiff

Behavioral regression testing for agent skills. Test your skills in CI with real harness runs and behavior diffs.

> Powered by Claude Agent SDK

Status: pre-release spike (v0.0.1). See `docs/` for the design decisions.

## What it will do

Change one line in a SKILL.md, open a PR, and CI shows you a behavioral diff:

```
- with old skill: agent created PLAN.md, ran npm test
+ with new skill: agent created TODO.md, never ran tests   ✗
```

Unlike existing skill collections and prompt testers, skilldiff runs your skill
inside a real agent harness against a fixture repo and asserts on what the agent
actually did — files changed, commands run, tool calls — deterministically.

## Spike (T1 — go/no-go)

The `spike` command validates the two feasibility gates from the design doc:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm install
npm run spike
```

Gate 1: headless agent run captures `tool_use` traces from a fixture repo.
Gate 2: `git show <base>:<skill path>` retrieves the old skill version for diffing.

Exit 0 = both gates pass → proceed to build. Exit 3/4 = which gate failed.

## Design docs

- `docs/design-decisions.md` — chosen approach, rejected alternatives, cost caps

## License

MIT
