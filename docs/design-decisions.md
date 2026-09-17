# skilldiff — Design Decisions

Compressed from the office-hours + eng-review session of 2026-09-18.
Full doc: `~/.gstack/projects/shopl-shopl-web-workspace/ayaan-featureSH-19107_-heatmap-design-20260918-074406.md`

## What this is

GitHub Action + CLI that runs agent skills headless against fixture repos on every
PR touching `skills/**`, asserts on observable behavior, and posts an old-vs-new
behavior diff as a PR comment.

## Locked decisions

- **Runner**: TypeScript Claude Agent SDK directly. Typed message stream gives
  `tool_use` traces; CLI adapter is a documented extension point only.
- **Diff baseline**: run old + new skill every PR (no caching in v0.1).
  Per-scenario maxTurns 10 + $2/PR default cap, explicit override; cost shown
  in the PR comment.
- **Old-skill fetch**: `git show <base>:<path>` / `git checkout <base> -- <paths>`
  into a temp copy — validated by the spike.
- **Assertions**: exactly 5 observable kinds — files_changed, commands_run,
  tool_calls, must_not, output_contains — partial matching, plain YAML.
  LLM judge is an optional flag, labeled fuzzy.
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

Multi-harness adapters, baseline caching, LLM-judge scoring by default,
Action Marketplace listing, web playground.
