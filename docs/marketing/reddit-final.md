# Reddit 최종 발행본 (영문, 글로벌 서브레딧용)

> 이 파일은 복붙하면 바로 올릴 수 있는 최종본입니다. 한국어 초안은 communities.md 참고.

## 1순위: r/LocalLLaMA (820k, 한국인 거의 없음, "I built" 문화 친화적)

**Title:**
I built an open-source regression tester for agent skills — it diffs what the agent *does*, not what the skill file says

**Body:**

I keep accumulating SKILL.md files for coding agents and every edit is a gamble. Change "write a plan first" to "think step by step first" and the agent may quietly stop running tests, or start writing files it shouldn't. The text diff looks trivial. The behavior diff isn't.

So I built **skilldiff** (MIT, on npm): it runs your skill headless against a fixture repo and asserts on *observable behavior* — files changed, commands run, tool calls, forbidden actions, output contents. On a PR it runs the old version and the new version of the skill and posts the behavior diff as a comment. Like snapshot testing, but for agent behavior.

Design choices this community might care about:

- **No shared API key.** Adapters for Freebuff, Cursor (cursor-agent), Codex (codex exec), and Claude Code. You test through the harness and subscription you already have. The Freebuff adapter needs zero setup — its desktop app is Codebuff-based and the desktop login token is literally a Codebuff API token.
- **Deterministic CI by default.** Record a tool trace once, replay it in CI for free. Live agent runs are opt-in (`--live`), so your CI bill is zero and your tests aren't flaky.
- **No LLM judge.** Assertions are partial-matching on observable events. The agent is allowed to be stochastic; the test isn't.

Example output (from the repo's recorded example — the "new" skill started creating TODO.md, which the old one never did):

```
✗ [must_not] files_changed does not include TODO.md
    actual (new): VIOLATED — TODO.md was changed
    note: this is a REGRESSION — old skill passed, new skill fails
```

Quickstart: `npx skilldiff init` scans your repo for skills and bootstraps scenario YAMLs. `npx skilldiff run <scenario> --live` does a real run.

Repo: https://github.com/scs0209/skilldiff
npm: https://www.npmjs.com/package/skilldiff

Honest caveats: the project is 4 days old, only the Freebuff harness is verified live end-to-end (the other parsers are verified against recorded traces), and the 5 assertion kinds are deliberately minimal. Curious what you'd want to assert on.

---

## 2순위: r/ChatGPTCoding / r/ClaudeAI

**Title:**
PSA: you can now CI-test your SKILL.md files (open source, works with your existing subscription — no API keys)

**Body:**

If you maintain more than ~3 agent skills, you've probably broken one without noticing. skilldiff runs your skill headless on a fixture repo and diffs old-vs-new behavior on every PR:

- files changed, commands run, tool calls, forbidden actions, output contents
- Freebuff: zero setup · Cursor: cursor-agent · Claude Code: claude CLI · Codex: codex exec
- No API key sharing, no LLM-judge flakiness. GitHub Action included — posts the behavior diff as a PR comment, flags REGRESSION when the new skill breaks something the old one did correctly.

`npx skilldiff init` to bootstrap from your existing skills.

Repo + demo GIF: https://github.com/scs0209/skilldiff

---

## 발행 팁 (r/LocalLLaMA 기준)

- 규칙: self-promotion 1/10 규칙 존재 — 발행 전 계정에 다른 활동이 거의 없으면, 포스트 본문을 "질문/토론 유도"로 끝내는 게 안전. 위 초안은 이미 "Curious what you'd want to assert on"으로 닫혀 있음
- 타이밍: 미 동부 시간 오전 7~10시 (한국시간 밤 9~12시) 주중이 피크. 주말도 LocalLLaMA는 잘 먹힘
- 표기: "MIT, on npm"과 caveat 문단은 신뢰도 때문에 유지할 것. 지우지 말 것
- 댓글 대응: "how is this different from evals?" 예상 — 답: evals는 출력 품질 점수, 이건 관찰 가능한 행동의 회귀 감지. LLM judge 없음
- 첫 코멘트로 자기 댓글 달아두기 추천: "Freebuff adapter discovery story (desktop token = Codebuff API token) is in the README if anyone's curious" — 토론 씨앗

## 올리지 말 곳 (현시점)

- r/cursor: 할당량 리셋(9/30) 전까지 cursor 어댑터가 live 미검증이라 "works with cursor" 주장이 반박당할 수 있음 — 9/30 이후 권장
- r/ClaudeAI: claude-code 어댑터 live 미검증 + 크레딧 이슈. 검증 후 올릴 것
