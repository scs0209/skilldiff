# Reddit 최종 발행본 — 오픈소스 홍보 서브레딧용

## 1순위: r/opensource (피드백 요청 톤)

**Title:**
[Project] skilldiff — regression testing for agent skills: it diffs what the agent *does*, not what the skill file says (MIT, on npm)

**Body:**

Hi all — I'd love feedback on an open-source project I just launched: **skilldiff** (MIT).

**The problem it solves:** I keep accumulating SKILL.md files for coding agents, and every edit is a gamble. Change "write a plan first" to "think step by step first" and the agent may quietly stop running tests or start writing files it shouldn't. The text diff looks trivial; the behavior diff isn't.

**What it does:** runs your skill headless against a fixture repo and asserts on observable behavior — files changed, commands run, tool calls, forbidden actions, output contents. On a PR it runs the old and new versions of the skill and posts the behavior diff as a comment, flagging REGRESSION when the new skill breaks something the old one did correctly. Like snapshot testing, but for agent behavior.

```bash
npx skilldiff init   # scans your repo for skills, bootstraps scenario YAMLs
npx skilldiff run scenario.yaml --old old-trace.json --new new-trace.json
npx skilldiff run scenario.yaml --live   # real agent run
```

**Design decisions I'd especially like feedback on:**
1. **No LLM judge.** Assertions are partial-matching on observable events. The agent may be stochastic; the test isn't. Too minimal? I'm curious what people would want to assert on.
2. **Recorded traces as the CI default.** Record a tool trace once, replay deterministically in CI for free; live runs are opt-in. Is the record/replay ergonomics workable?
3. **Harness adapters over API keys.** Adapters exist for Freebuff, Cursor, Codex, and Claude Code — you test through the harness subscription you already have. (Fun discovery: the Freebuff desktop app is Codebuff-based and its login token works as a Codebuff API token, so that adapter needs zero setup.)

Repo (README has screenshots + demo GIF): https://github.com/scs0209/skilldiff
npm: https://www.npmjs.com/package/skilldiff

Honest status: 4 days old, 40 unit tests, only the Freebuff harness verified live end-to-end (the other three adapters are verified against recorded traces so far). Contributing guide and harness-request issue template are ready — adding a harness adapter is ~40 lines. It's my first OSS launch, so any feedback on the README, API shape, or CI workflow is very welcome.

---

## 2순위: r/coolgithubprojects (링크 쇼케이스 톤, 짧게)

**Title:**
skilldiff — open-source regression tester for AI agent skills: CI-diffs what your agent *does* after a skill edit (files changed, commands run, forbidden actions). MIT, on npm.

**Body:**

Text diffs can't tell you that a one-line SKILL.md edit made your agent stop running tests. skilldiff runs old vs. new skill versions on a fixture repo and posts a behavior diff on the PR — recorded traces keep CI free and deterministic, live runs optional.

- No API keys: adapters for Freebuff, Cursor, Codex, Claude Code
- GitHub Action included, 5 assertion kinds, no LLM judge
- `npx skilldiff init` bootstraps scenarios from your existing skills

https://github.com/scs0209/skilldiff

Feedback welcome, especially on the assertion set and the record/replay workflow.

---

## 발행 메모

- r/opensource는 "[Project]" 태그 관행 — 유지할 것
- 첫 OSS 출시임을 밝히는 문단은 유지 (커뮤니티가 피드백 요청에 후함)
- 댓글 대응 준비: "evals와 뭐가 달라?" → evals는 출력 품질 점수, skilldiff는 관찰 가능한 행동의 회귀 감지
- 타이밍: 한국시간 밤 9~12시 (미 동부 아침)
- r/opensource는 요일 영향 적음, r/coolgithubprojects는 주중 낮(ET) 선호
