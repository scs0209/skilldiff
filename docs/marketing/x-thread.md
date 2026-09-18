# X (Twitter) launch thread draft

## Post 1 (후킹)

SKILL.md 한 줄 고쳤는데, 에이전트가 테스트를 안 돌리기 시작했다면?

텍스트 diff로는 못 잡습니다. 행동 diff가 필요해요.

그래서 skilldiff를 만들었습니다. 오픈소스. npm에 올렸어요.

npx skilldiff init ← 끝

🧵

## Post 2 (before/after — 핵심 비주얼)

이게 리포트입니다:

- with old skill: agent created PLAN.md, ran npm test
+ with new skill: agent created TODO.md, never ran tests   ✗ REGRESSION

"REGRESSION"이라고 자동으로 판정해줍니다 — old는 통과했는데 new가 실패했으니까.

## Post 3 (동작 원리 3줄)

동작 방식:
1. PR에서 skills/**가 바뀌면
2. base 브랜치의 old 스킬 + 수정된 new 스킬을 각각 실제 에이전트 하네스로 실행
3. 파일 변경/명령 실행/도구 호출을 관찰해서 YAML assertion으로 비교

## Post 4 (차별점 — API 키 불필요)

제일 잘 팔리는 포인트: API 키 필요 없음.

Freebuff 쓰면 데스크톱 로그인 토큰 그대로 사용.
Cursor, Codex, Claude Code도 각자 자기 구독으로 실행.
"팀 전체가 하나의 API 키 공유" 문제가 원천적으로 없음.

## Post 5 (철학)

LLM judge로 판단하는 테스트는 싫었습니다. 결정적이지 않으니까.

skilldiff의 assertion은 5종뿐 — files_changed, commands_run, tool_calls, must_not, output_contains. 전부 관찰 가능한 행동. 전부 부분 매칭. 전부 리뷰 가능.

에이전트가 LLM인 건 맞지만, assertion까지 LLM일 필요는 없습니다.

## Post 6 (CTA)

GitHub: https://github.com/scs0209/skilldiff
npm: https://www.npmjs.com/package/skilldiff

v0.1. Freebuff 어댑터는 라이브 검증 완료.
하네스 어댑터 추가 기여 환영 — 40줄이면 됩니다.

혹시 당신의 SKILL.md, 마지막으로 안 깨진 게 언제인가요?

## 영어 버전 (글로벌 타겟)

**Post 1:**
You edited one line in a SKILL.md. Now the agent silently stopped running tests. A text diff can't catch this. A behavior diff can.

I built skilldiff — open source, on npm:

npx skilldiff init

🧵

**Post 2:**
The report:

- old skill: agent created PLAN.md, ran npm test
+ new skill: agent created TODO.md, never ran tests ✗ REGRESSION

It flags regressions automatically: old passed, new fails.

**Post 3:**
How: on PRs touching skills/**, it runs old + new skill in a real harness (Freebuff/Cursor/Codex/Claude Code — your own login, no shared API key), observes what the agent did, and diffs.

**Post 4:**
No LLM-judge assertions. Just 5 deterministic kinds: files_changed, commands_run, tool_calls, must_not, output_contains.

The agent is the LLM. The assertions don't have to be.

**Post 5:**
GitHub: https://github.com/scs0209/skilldiff
npm: skilldiff

v0.1. Freebuff adapter live-verified. Harness adapters welcome — ~40 lines each.
