# Show HN draft

## Title (40자 내외, 감탄부 없이)

**Show HN: Skilldiff – Behavioral regression testing for agent skills**

대안 타이틀:
- Show HN: I built a CI tool that diffs what AI agents actually do, not their code
- Show HN: Behavior diffs for SKILL.md changes (like snapshot tests, but for agent skills)

## Body (첫 댓글로)

Hi HN! I kept breaking my own agent skills.

Like a lot of people I have dozens of SKILL.md files now (Claude Code, Cursor, Codex all load them). Every time I edit one line of instructions, I had no idea what else changed — "create a plan before coding" might quietly stop the agent from running tests, and I'd find out from a broken session days later. Text diffs of markdown can't answer "what will the agent do differently?"

So I built skilldiff. It runs your skill inside a real agent harness against a fixture repo, and asserts on what the agent actually did:

  - with old skill: agent created PLAN.md, ran npm test
  + with new skill: agent created TODO.md, never ran tests   ✗

The interesting design decisions:

1. **It runs on YOUR existing agent subscription, not an API key.** Adapters exist for Freebuff, Cursor (`cursor-agent`), Codex (`codex exec`), and Claude Code. Each contributor runs tests through the harness they already pay for. Freebuff works with zero setup — it uses your desktop login token.

2. **Exactly 5 assertion kinds, all partial-matching, in plain YAML.** files_changed, commands_run, tool_calls, must_not, output_contains. No LLM-judge scoring in the default path because we want deterministic, reviewable CI. (The agent IS the LLM; the assertions are not.)

3. **Recorded-trace mode for CI.** A live agent run is slow and costs quota. So you record a trace once locally, commit it as a fixture, and CI replays it deterministically for free. Live runs are opt-in.

4. **It fetches the old skill from git and runs both.** `skilldiff run scenario.yaml --live --base origin/main` — old and new skill each get run against the fixture, and the report annotates REGRESSION when old passed and new fails.

One hard-won finding: Freebuff desktop's login token is literally a Codebuff API token, so you can drive headless agent runs through @codebuff/sdk with zero extra auth. That's what let me make "npx skilldiff init && npx skilldiff run --live" work on a fresh machine with no API keys.

Repo: https://github.com/scs0209/skilldiff
npm: https://www.npmjs.com/package/skilldiff

It's v0.1 — core loop works end-to-end (scenario → old/new runs → behavior diff → PR comment via GitHub Action). The cursor/codex/claude-code adapters have verified parsers but live runs are only proven on Freebuff so far.

What would you want this to assert on? The 5 kinds are deliberately minimal.

## 준비 체크리스트

- [ ] 제출 시간: 화~목 아침 7~9시 ET (HN 트래픽 피크)
- [ ] README 스크린샷/GIF 먼저 삽입 (텍스트만 있는 README는 클릭 손실 큼)
- [ ] 도그푸딩 리포트 실제 결과물 확보 후 본문에 실제 출력 넣기
- [ ] 질문 대비 답변 준비: "하네스마다 비용?", "프롬프트 인젝션?", "LLM judge 왜 없음?"
