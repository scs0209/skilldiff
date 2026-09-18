# Contributing to skilldiff

Thanks for your interest in making agent-skill testing better. This guide gets you from clone to merged PR.

## Why contribute

skilldiff solves a problem almost every agent-skill project has: **you change one line in a SKILL.md and nobody knows what else changed.** If you've ever broken a skill and found out from an angry user, you're the right person here.

Good first contributions:
- A new harness adapter (bring your own harness — see below)
- Better assertion kinds or report formatting
- Example scenarios for real-world skills
- Docs improvements (non-native-English-friendly PRs welcome)

## Development setup

```bash
git clone https://github.com/scs0209/skilldiff.git
cd skilldiff
npm install
npm test          # 30 unit tests, should all pass
npx tsc --noEmit  # typecheck
```

Node >= 20 required. No API key needed for development — the test suite is fully deterministic (recorded traces only).

## Verifying a harness adapter

If you touch `scripts/adapters.ts` or `scripts/freebuff-adapter.ts`, run:

```bash
npm run spike:recorded   # parser replay against real recorded traces — no quota needed
npm run spike            # live: auto-detects an installed harness CLI (uses YOUR login)
npm run spike:freebuff   # live: Freebuff/Codebuff via the desktop app's token
```

`spike:recorded` must pass. Live spikes need a logged-in harness and consume your own quota — never ask another contributor to spend theirs.

## Adding a harness adapter

This is the highest-value contribution type. The pattern:

1. Add a `HarnessAdapter` to `scripts/adapters.ts`:

```ts
export const myAdapter: HarnessAdapter = {
  name: "my-harness",
  cmd: "my-harness-cli",
  baseArgs: ["-p", "--output-format", "stream-json"], // headless flags
  extractToolUses: (line) => {
    // parse ONE JSON event line, return tool uses found in it
    const msg = line as { type?: string; tool?: { name?: string; input?: object } };
    if (msg.type === "tool_use" && msg.tool?.name) {
      return [{ tool: msg.tool.name, input: msg.tool.input ?? {} }];
    }
    return [];
  },
};
```

2. Add a recorded-trace fixture for it in `scripts/recorded-spike.ts` (2–3 real lines from your harness's output).
3. Add the name to the allowed `harness` list in `src/scenario.ts`.
4. Wire it into `runFreebuffSide`'s sibling in `src/runner.ts` (see the existing Freebuff implementation).
5. Test with a real run: `SKILLDIFF_HARNESS=my-harness npm run spike`.

Requirements for the harness CLI: headless/print mode, JSON event output (one JSON object per line is easiest), and a way to run with tool permissions pre-granted.

## Pull request process

1. Fork, create a branch from `main` (`feat/...` or `fix/...`).
2. Keep PRs focused — one feature or fix per PR.
3. Run `npx tsc --noEmit && npm test` before pushing. All tests must pass.
4. If your change alters observable behavior (assertions, report format), update `examples/` traces and the README table.
5. Write commit messages that explain *why*, not just *what*. Reference issues with `(#123)`.
6. New files get the MIT license header reference (see existing `src/*.ts`).

We use squash merges. Your PR title becomes the commit message, so make it good.

## Issue guidelines

- **Bug report**: scenario YAML + trace JSON that reproduces it, harness name and version, expected vs actual behavior.
- **Feature proposal**: the problem first, then your proposed assertion/report change. Show the YAML you wish you could write.
- **New harness request**: link the harness's headless-mode docs. Better yet, prototype the adapter first — proposals with working parsers get merged fast.

## Code style

- TypeScript strict mode, ESM imports with `.js` extensions (compiled output requirement).
- No default exports in `src/`.
- Comments explain decisions and constraints, not syntax.
- Prefer plain functions over classes. The one exception (`CodebuffClient`) is the SDK's, not ours.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
