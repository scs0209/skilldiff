# 커뮤니티별 홍보 초안

## Reddit r/LocalLLaMA / r/ChatGPTCoding

**Title:** I built a regression tester for agent skills (SKILL.md) — it diffs what the agent actually does on PRs

**Body:**

Like most of you I accumulate tons of agent skill files. The problem: editing them is scarcery. You change "write a plan first" to "think step by step first" and suddenly the agent skips tests or writes to different files. Text diff tells you nothing about behavior.

skilldiff (MIT, on npm) runs your skill in a real harness against a fixture repo and asserts on observable behavior: files changed, commands run, tool calls, forbidden actions, output contents.

Key design choices I think this community will care about:

- **No shared API key.** Adapters for Freebuff, Cursor, Codex, Claude Code. You run tests through the harness you already have. (Freebuff needs zero setup — its desktop token is literally a Codebuff API token.)
- **Deterministic CI by default.** Record a trace once, replay it in CI for free. Live agent runs are opt-in only.
- **No LLM judge.** Assertions are partial-matching on observable behavior only. The agent is allowed to be stochastic; the test isn't.

Fun technical bit: Freebuff's desktop app is Codebuff-based, and its login token works as a Codebuff API key — that's how "npx skilldiff init && npx skilldiff run --live" works with zero API keys.

Repo: https://github.com/scs0209/skilldiff

Curious what you'd want it to assert on. The 5 assertion kinds are deliberately minimal.

---

## Reddit r/ClaudeAI / r/cursor

**Title:** PSA: you can now CI-test your SKILL.md files (open source, works with your existing subscription)

**Body:**

If you maintain more than ~3 skills, you've probably broken one without noticing. skilldiff runs your skill headless on a fixture repo and diffs old-vs-new behavior on every PR — like snapshot testing, but for agent behavior.

- Freebuff: zero setup (uses your desktop login)
- Cursor: works through cursor-agent CLI
- Claude Code: works through claude CLI
- Codex: works through codex exec

No API key sharing, no LLM-judge flakiness. GitHub Action included: posts the behavior diff as a PR comment.

https://github.com/scs0209/skilldiff

---

## Hacker News 준비

→ 별도 파일: docs/marketing/show-hn.md

## DEV.to / 개인 블로그용 글 (롱폼, 나중에)

구조:
1. "스킬을 깨뜨린 이야기" — 실제 사고담으로 시작
2. 텍스트 diff vs 행동 diff 비교
3. 하네스 어댑터 아키텍처 설명 (Freebuff 토큰 발견 스토리 재밌음)
4. 5 assertion 철학 (왜 LLM judge를 안 썼나)
5. 사용법 워크스루
6. 로드맵 (record 커맨드, 하네스 추가)

## 발행 체크리스트

- [ ] README 스크린샷/GIF 삽입 (모든 채널 이전에)
- [ ] 첫 GitHub issue 템플릿 동작 확인
- [ ] "good first issue" 라벨 붙은 이슈 2~3개 준비 (기여 유입용)
- [ ] 도메인/링크 단축 (선택)
- [ ] 발행 순서: HN(화~목 아침 ET) → Reddit(주말 피크) → X(아무때, 스레드) → DEV.to(다음날)
