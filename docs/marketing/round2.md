# 2차 홍보 초안 (demo + orbit + 신규 리포트 반영)

이전 초안(communities.md, show-hn.md)은 구 버전 기준. 이 파일이 현재 기준.

---

## Reddit — r/ClaudeAI (주력), r/ChatGPTCoding 재발행용 변형

### Title (r/ClaudeAI)

**I built an open-source regression tester for SKILL.md files — it caught my skill silently creating a file it wasn't supposed to**

(변형: r/ChatGPTCoding — "Text diff said LGTM. The agent had started creating files it shouldn't. So I built skilldiff.")

### Body

I edit my agent skills constantly. One line in SKILL.md — "summarize what you did" here, soften an instruction there. The git diff always looks harmless: `1 file changed, +1 -1`. LGTM, merge.

Then I noticed one of my skills had started writing a file it was never asked to touch. Nothing "broke" — the task still got done. The behavior just quietly widened, and no diff of markdown would ever show that.

So I built **skilldiff** (MIT, npm): it runs your skill in a real agent harness against a tiny fixture repo — old version and new version — and asserts on what the agent *actually did*: files changed, commands run, tool calls, forbidden actions, output contents. Then it posts the diff as a PR comment and gates the merge.

**10-second taste, zero setup:**

```
npx skilldiff demo
```

It replays a real (bundled) regression end-to-end: a notes skill that got one line edited and started also creating a `TODO.md` its scenario forbids. The terminal report ends with a "What to fix" section — likely cause + suggested fix — and opens an animated behavior-diff page in your browser.

What lands on a PR looks like this (real output from dogfooding):

| assertion | expectation | baseline | candidate |
|---|---|---|---|
| `files_changed` | NOTES.md | ✓ pass | ✓ pass |
| `must_not` | files_changed does not include TODO.md | ✓ pass | ✗ **REGRESSION** |
| `output_contains` | SPIKE RAN OK | ✓ pass | ✓ pass |

Text diff said LGTM. The behavior diff says the agent now creates a file the scenario forbids.

Design choices that seem to matter to people here:

- **No shared API key.** Run tests through the harness you already pay for: Freebuff (zero setup — desktop login), opencode, Cursor CLI, Codex, Claude Code. Adapters are ~40 lines.
- **No LLM judge.** Assertions are plain YAML with partial matching on observable behavior. The agent is allowed to be stochastic; the test isn't.
- **Deterministic CI by default.** Record a trace once, replay it in CI for free and offline. Live agent runs are opt-in (`--live`), with `--repeat N` batch mode that gates on empirical failure rate — because a single run is a sample, and a 15%-probability regression is invisible to single comparisons most of the time.

Repo: https://github.com/scs0209/skilldiff
npm: https://www.npmjs.com/package/skilldiff

Honest state: v0.1. The core loop works end-to-end (scenario → old/new runs → behavior diff → PR comment via included GitHub Action). The recorded-trace replay is what CI uses; live runs are verified on Freebuff and opencode so far, parser-verified on the rest. `record` (one-command trace capture) is the next big piece.

Genuinely curious what you'd want it to assert on. The 6 kinds (`files_changed`, `commands_run`, `tool_calls`, `must_not`, `output_contains`, `output_not_contains`) are deliberately minimal — I'd rather keep them sharp than grow a DSL.

---

### r/ChatGPTCoding / r/LocalLLaMA 변형 포인트

- 첫 문단을 "agent skills"보다 "system prompts / project instructions you version control"로 일반화
- 하네스 표는 유지 (Cursor/Codex 언급이 이 커뮤니티에선 신뢰 신호)
- demo 한 줄을 본문 맨 위로 올림

---

## DEV.to 아티클 (롱폼)

### Title

**git diff said LGTM. The agent disagreed. — building a regression tester for AI agent skills**

(대안: **Your SKILL.md is code. It's time it had tests.**)

### Hero

demo GIF: `https://github.com/scs0209/skilldiff/raw/main/docs/assets/demo-terminal.gif`

### Outline (실제 초안)

**1. The bug nobody could see**

내 notes-taking 스킬에 한 줄을 추가했다 — 에이전트가 마무리로 "할 일 요약"을 남기도록. git diff는 `+1 -1`. 코드 리뷰 관점에선 완벽했다. 그리고 그날부터 에이전트는 내가 요청한 적 없는 `TODO.md`를 만들기 시작했다. 태스크는 여전히 완료됐다. 아무것도 "깨진" 게 없었다 — 행동만 조용히 넓어졌다.

텍스트 diff의 근본 한계: 마크다운 지시문의 diff는 "무엇을 바꿨는지"만 알려준다. 스킬은 코드가 아니라서, "그 한 줄이 에이전트의 *행동*을 어떻게 바꾸는지"는 텍스트에 없다. 행동은 실행해야 관찰된다.

**2. The idea: snapshot testing, but for agent behavior**

skilldiff의 루프는 단순하다:

1. 시나리오 YAML — fixture 저장소 + assertions (`expect` / `must_not`)
2. base 브랜치에서 old 스킬을 가져와 실제 에이전트 하니스에서 실행, trace 수집 (tool calls, files changed, commands, output)
3. new 스킬도 동일하게 실행
4. 양쪽을 assertions로 채점 → old는 통과했는데 new가 실패하면 **REGRESSION**

핵심 디자인 판결 하나: **LLM judge를 안 썼다.** 에이전트가 확률론적이면 채점자까지 확률론적일 필요는 없다. assertions는 부분 매칭 YAML — 결정론적이고, 리뷰 가능하고, CI에서 0 variance.

**3. The report doesn't just say "broken" — it says what to fix**

실패 행마다 what happened / likely cause / fix가 붙는다:

> what happened: the old skill never touched TODO.md; the new skill created/modified it via Write.
> likely cause: an added instruction in SKILL.md now nudges the agent to produce TODO.md ("summarize what you did"-style lines are common culprits).
> fix: add an explicit negative constraint to SKILL.md, or scope the instruction to NOTES.md only — then re-run.

**4. The visualization (why I built an orbit)**

CLI 출력을 GitHub에 올리고 나서 든 생각: 이걸 한눈에 보여줄 수 없을까. 그래서 orbit을 만들었다 — old run 카드가 행동 diff 엔진을 통과해 new run 카드로 흐르는 단일 HTML 페이지 (JS 0바이트, 외부 에셋 0개). 회귀 경로만 붉게 점등되고, 아래 평가 대장에 baseline/candidate 판정이 나란히 온다. 배치 모드에선 assertion당 카드 하나에 실패율이 기울기로 그려진다.

[orbit-hero.png 삽입]

**5. Your subscription, not my API key**

하니스 어댑터 ~40줄: Freebuff (데스크톱 로그인 재사용 — 설정 0), opencode, Cursor CLI, Codex, Claude Code. 각자 이미 내돈으로 쓰는 하니스에서 돌린다. 공유 API 키도, 크레딧 풀도 없다.

**6. Honest limits (이 섹션을 빼면 홍보가 아니다)**

- `record` (한 커맨드로 trace 캡처)는 다음 큰 조각 — 지금은 하니스 세션에서 캡처한 trace를 커밋하는 방식
- 단일 실행은 샘플일 뿐. `--repeat N` 배치 게이트가 답이지만 라이브 크레딧을 쓴다. CI 기본값은 결정론적 recorded replay
- 부분 매칭은 과잉 차단 가능 — 시나리오 작성이 곧 품질

**7. Try it**

```
npx skilldiff demo        # 10초, 설정 0, 브라우저에서 행동 diff까지
npx skilldiff init        # 내 스킬 스캔 → 시나리오 생성
```

Repo: https://github.com/scs0209/skilldiff

**8. Closing question**

여러분의 스킬이 "조용히 다른 일"을 하게 되면 뭘 어설션하고 싶은지 댓글로 — 6종 어설션을 의도적으로 최소로 유지 중이라, 어떤 종류가 더 필요한지가 로드맵을 결정합니다.

### 태그

`ai`, `agents`, `devops`, `testing`, `opensource`

### 발행 체크리스트

- [ ] Reddit 먼저 (r/ClaudeAI, 화~목 오전 ET) → 반응 보고 r/ChatGPTCoding +3일
- [ ] DEV.to는 Reddit 반응의 Q&A를 본문에 반영해 다음날 발행 (재홍보가 아니라 "2.0"이 되도록)
- [ ] 두 채널 모두 스크린샷은 GitHub raw URL (docs/assets/) 사용 — repo 트래픽으로도 집계됨
- [ ] 답변 준비: 비용(하니스별), 프롬프트 인젝션(fixture 격리), "왜 LLM judge 없나", "playwright 대비"
