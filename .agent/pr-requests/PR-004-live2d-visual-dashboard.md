# PR-004: Live2D/Cubism visual dashboard runtime integration (M3)

- Status: Ready
- Project: h4v3-meowcore-avatar-lab
- Product type: HOST_SERVED_WEB_RUNTIME
- Validation profiles: SERVER_CLI / WEB_BROWSER / HOST_RUNTIME / HUMAN_VISUAL
- Base branch: `main`
- Required work branch: `feat/m3-live2d-visual-dashboard`
- Source-of-truth base: latest fetched `origin/main`
- Remote delivery: Required
- Pull request language: Korean
- Request path: `.agent/pr-requests/PR-004-live2d-visual-dashboard.md`
- Merge authority: Human/user only
- Source issue: `rhgo1749/h4v3-meowcore-avatar-lab#10`
- Kanban task ID: `t_f8a75e5e`
- Intake idempotency key: `github:rhgo1749/h4v3-meowcore-avatar-lab:issue:10`
- Planning/lead owner: Luna lead
- Implementation owner: Luna lead and/or delegated Luna workers
- Automation stop state: `HOST_VALIDATION_REQUIRED` (real SDK/model browser E2E) + `HUMAN_VALIDATION_REQUIRED` (visual deformation quality)

## 0. Mandatory repository route

- `AGENTS.md`
- `.agent/PR_REQUEST_TEMPLATE.md`
- `.agent/pr-requests/PR-003-debug-semantic-control-panel.md` (M2 contract, source of semantic ids/ranges)
- `docs/ARCHITECTURE.md`
- `docs/LIVE2D-RIG-SPEC.md`
- `docs/SECURITY.md`
- `runtime/server/{config,state,app,server}.js`
- `runtime/public/debug.html`
- `runtime/test/*`, `runtime/smoke/browser-smoke.js`

## 1. Objective

M2의 8개 semantic control(`angleX`, `angleY`, `bodyX`, `blink`, `mouth`, `smile`, `squash`, `bounce`)과 reset/beat/state contract를 실제 renderer adapter 뒤에 연결해 `/debug`를 Avatar Lab용 visual dashboard로 발전시킨다.

- **Live model viewport**: 실제 Cubism 모델 렌더(공식 Cubism SDK for Web 경유) 또는 deterministic placeholder 렌더
- **Semantic control panel**: M2 contract 그대로 유지 (slider + numeric + reset/beat/refresh)
- **Runtime inspection panel**: semantic state / mapped Cubism parameter(read-only) / beat·event 상태
- **Preset / torture-test actions**: Neutral/Left/Right/Up/Down/Blink closed/Mouth open/Smile/Frown/Squash/Stretch/Bounce max

## 2. Confirmed background

- Current repository behavior (origin/main @ b783f80): PR-003(M2) merged. `/api/state`는 placeholder model + 8개 semantic controls + beat event를 서버가 소유하고, `/debug`는 HTML 컨트롤/검사 surface. 실모델·SDK 없음, zero-runtime-dependency, Docker `node:22-alpine`.
- Defect/limitation: semantic state는 서버에 있지만 실제 렌더 경로가 없음. placeholder는 텍스트 상태만 표시.
- Repository evidence: `runtime/server/state.js` CONTROL_SCHEMA(8 ids + meaning), `runtime/test/*`, `runtime/smoke/browser-smoke.js`, `models/README.md`(placeholder만 허용).
- Source Issue-only product intent: M3는 리깅 자동화가 아니라 **이미 export된 합법적 테스트 모델을 runtime에 연결해 semantic adapter가 시각적으로 동작하는지 검증**하는 단계. `/debug`는 production avatar output이 아니라 Avatar Lab validation dashboard.
- Runtime assumption: 브라우저/WebGL 렌더링 우선. 서버는 렌더러·모델·state 소유권 유지, Hermes/H4V3-DJ는 client.
- Human/Cubism assumption: 실제 모델·SDK 라이선스 확인 전에는 asset/Core commit 금지(fail-closed).
- Explicit assumptions:
  - 실제 SDK/Core/model 파일은 이 PR에 커밋하지 않는다. code path + adapter + manifest 계약만 준비.
  - default(모델 미설정) 상태에서는 기존 placeholder 동작·API·테스트를 깨지 않는다.
  - raw Cubism parameter id는 read-only inspector(/api/model, /api/state mapped)로만 노출하고 public mutation API로는 노출하지 않는다.

## 3. Cross-cutting impact gate

- Security impact: AFFECTED (검토됨) — 모델 정적 라우트는 traversal-guard, modelId allowlist, 미설정 시 404. SDK/모델 미탑재 상태는 fail-closed. mutation API 추가 없음.
- Privacy/data impact: NONE
- Auth/permission impact: NONE (기존 loopback 정책 유지)
- Host/runtime/network impact: NONE (바인드/포트/컴포즈 계약 변경 없음; env passthrough만 추가)
- Third-party asset/license impact: AFFECTED (검토됨) — Cubism SDK/Core/model 바이너리 커밋 없음. `runtime/public/vendor/` gitignore. 라이선스 확인은 human gate.
- Required canonical docs: `docs/ARCHITECTURE.md`, `runtime/README.md`, `models/runtime/README.md`
- Required evidence: unit/contract tests, typecheck, headless browser smoke, `git diff --check`
- Residual risk / owner: real SDK API surface는 repo에서 검증 불가 → host에서 licensed SDK로 E2E 필요(HOST_VALIDATION_REQUIRED), deformation 품질은 human visual gate.

## 4. In scope

1. 모델 매니페스트 계약 + 레지스트리 (`models/runtime/<id>/manifest.json`, `runtime/server/model.js`)
   - fail-closed 상태: manifest 누락/무효/모델3 누락/SDK 부재를 `/api/model`·`/api/state`에 bounded error로 노출
   - modelId allowlist(`[A-Za-z0-9_-]`) + 경로 traversal guard
2. 공유 매핑 엔진 `runtime/shared/mapping.js` (server + browser 동일 모듈)
   - semantic id → Cubism parameter id 매핑: scale/bias/min/max, clamp
   - signed direction은 M2 meaning contract 준수(angleX: left↔right, blink: open→closed 등)
   - unknown semantic id / non-finite / min>=max → fail-closed
3. 서버 API 확장 (기존 surface 비파괴)
   - `GET /api/model` — model descriptor + manifest + mapping + SDK 가용성 (read-only)
   - `GET /models/<modelId>/<file>` — 해당 모델 디렉토리 한정 정적 서빙
   - `GET /js/mapping.js` — 공유 매핑 모듈을 클라이언트에 서빙
   - `GET /api/state`에 cubism 모델 설정 시 `mapped`(read-only 매핑 결과) 추가
4. Renderer adapter `runtime/public/live2d/renderer.js`
   - renderer registry(placeholder ↔ cubism 교체 가능)
   - deterministic Canvas 2D placeholder renderer(실모델 없이도 시각 검증 가능)
   - cubism renderer: 공식 SDK for Web 기반 로드/렌더 경로, 단계별 fail-closed, 매핑 적용
5. `/debug` M3 대시보드 (viewport + controls + inspector + presets + event log)
6. 테스트/스모크: mapping clamp/direction 회귀, manifest fail-closed, /api/model·/models 라우트, 대시보드 요소·presets·mapping round-trip, console error 0
7. 문서: `models/runtime/README.md`(manifest 계약), `runtime/README.md`(M3 설치/검증), `docs/ARCHITECTURE.md`(M3 인터페이스), `.env.example`, `.gitignore`

## 5. Explicit non-goals

- Cubism SDK/Core/model 바이너리 커밋 (라이선스 미확인 → fail-closed 유지)
- 자체 Live2D renderer 구현 (placeholder Canvas 2D는 "Live2D renderer"가 아니라 기존 placeholder의 시각화)
- 서버측 GPU 렌더링
- Cubism Editor GUI 자동화 / 자동 리깅 / artwork 생성
- H4V3-DJ production event bridge / production WebSocket bus / TTS lip-sync
- physics/hair 시뮬레이션 고도화
- generic raw parameter mutation API
- arbitrary file/command/Docker endpoint
- `/`(production surface)·compose·Dockerfile·바인드 계약 변경 (모델 파일은 volume mount로 주입)

## 6. Architecture invariants

```text
Ubuntu Host
└─ Meowcore Avatar Runtime (Docker)
     ├─ model registry (manifest, fail-closed)
     ├─ semantic state owner (M2 contract 불변)
     ├─ /api/model, /models/<id>/, /js/mapping.js (read-only)
     └─ /debug dashboard
           ├─ viewport: cubism renderer (official SDK) | placeholder renderer
           ├─ semantic controls (M2 API로 조작)
           └─ inspector: semantic state / mapped params (RO)
                ▲
        Hermes Docker / H4V3-DJ (clients)
```

- Host runtime이 model/state 소유. 브라우저가 렌더.
- semantic contract(public)와 Cubism parameter mapping(model-specific config) 분리.
- raw Cubism id는 read-only 노출만.

## 7. Implementation requirements

- latest `origin/main`(b783f80) 기준 dedicated branch `feat/m3-live2d-visual-dashboard`.
- 기존 M2 API/테스트/스모크를 비파괴 유지 (placeholder 기본값 불변).
- 매핑 엔진은 server와 browser가 동일 모듈 사용 → 회귀 테스트가 실제 동작 검증.
- 매니페스트 스키마 검증은 fail-closed: 알 수 없는 semantic id, 비유한 값, min>=max 거부.
- innerHTML 사용 금지(public.test.js guard) — DOM 노드로만 렌더.
- deterministic placeholder: 랜덤·시계열 의존 없음.
- 404 script 참조 금지: SDK 스크립트는 cubism 모델 설정 시에만 동적 로드.

## 8. Validation contract

### Repository/server (REQUIRED)
- `npm test` 전체 PASS (기존 + mapping/model/라우트 신규)
- mapping clamp/direction 회귀 (예: blink 0→1이 ParamEyeLOpen 1→0, angleX min/max 방향)
- manifest fail-closed 회귀 (missing/invalid/mapping invalid/model3 missing)
- `/api/model`·`/models/<id>/` traversal guard 회귀
- `npm run typecheck` PASS, `git diff --check` PASS

### Web/browser (REQUIRED)
- 기존 smoke 유지 + 대시보드: viewport canvas 존재, presets 동작(서버 state 반영), inspector에 semantic state/mapped params 표시, reset/beat 유지, console error 0
- fixture cubism 모델 + stub SDK로 renderer adapter round-trip(control → mapping → parameter set) 검증

### Host runtime (REQUIRED for real SDK/model E2E)
- licensed Cubism SDK + 실제 모델을 volume mount하고 브라우저에서 렌더 확인 → `HOST_VALIDATION_REQUIRED`로 보고
- 본 PR의 repository 검증으로 host PASS를 대체하지 않는다

### Human/Cubism/visual (REQUIRED)
- 실제 모델의 deformation/outline 품질 판단은 human gate → `HUMAN_VALIDATION_REQUIRED`

## 9. Luna lead / delegation contract

Lead가 직접 구현·검증한다. 위임 시 diff/evidence를 독립 재검토한다. PR 생성 가능, merge 금지.

## 10. Understanding handoff

- Confirmed cause: semantic layer는 존재하나 실제 렌더 경로/시각 surface 부재.
- Before flow: `/debug` = 텍스트 상태 + 슬라이더. 모델·SDK 없음.
- After flow: `/debug` = viewport(canvas 렌더) + controls + inspector(mapped RO) + presets + event log. 모델/SDK 미설정 시 placeholder 렌더 + 명시적 fail-closed 상태.
- Repository source of truth: CONTROL_SCHEMA(`runtime/server/state.js`), 매핑 엔진(`runtime/shared/mapping.js`), manifest 계약(`models/runtime/README.md`).
- Runtime/host source of truth: 브라우저 WebGL 렌더 + volume-mount된 licensed 모델/SDK.
- Human/Cubism source of truth: Cubism Editor 리깅/아웃라인 품질 판단.
- Key decision: 매핑 엔진을 server/browser 공유 모듈로 단일화; SDK/model은 커밋하지 않고 fail-closed 경로 + 문서화된 설치 절차만 제공.
- Rejected alternative and reason: 서버측 GPU 렌더러(브라우저 우선 정책 위배), SDK 커밋(라이선스 미확인), 자체 WebGL Live2D 구현(비목표).
- First debugging entry point: `runtime/server/model.js` registry 상태 → `/api/model` 응답 → renderer.js 상태 메시지.

## 11. Completion criteria

- [ ] `/debug`에 실제 렌더 viewport(canvas)가 있고 model load/error 상태를 명확히 표시
- [ ] 8개 semantic controls + reset/beat/refresh가 M2 contract 그대로 동작
- [ ] semantic → Cubism mapping이 명시적 매니페스트/공유 모듈로 분리
- [ ] raw Cubism parameter는 read-only(inspector/API)로만 노출, mutation API 없음
- [ ] presets/torture actions 동작 (Neutral/Left/Right/Up/Down/Blink/Mouth/Smile/Frown/Squash/Stretch/Bounce)
- [ ] model load failure가 bounded/fail-closed
- [ ] 기존 semantic contract/API/테스트 비파괴
- [ ] mapping clamp/direction 회귀 테스트 존재
- [ ] browser smoke console error 0
- [ ] SDK/Core/model 바이너리 커밋 없음, `runtime/public/vendor/` gitignore
- [ ] dedicated branch pushed + 한국어 PR 1개, merge 안 함

## 12. Final report

- source issue #10, request path, branch/PR, changed files
- manifest/mapping 계약, API 변경, fail-closed 상태 목록
- repository/browser 검증 evidence, host/human validation stop states
- licensed 모델+SDK 설치 절차(residual handoff)
