# PR-003: Debug semantic control panel / runtime state adapter

- Status: Ready
- Project: h4v3-meowcore-avatar-lab
- Product type: RUNTIME / TOOLING
- Validation profiles: SERVER_CLI / WEB_BROWSER
- Base branch: `main`
- Required work branch: `feat/m2-debug-controls`
- Source-of-truth base: latest fetched `origin/main`
- Remote delivery: Required
- Pull request language: Korean
- Request path: `.agent/pr-requests/PR-003-debug-semantic-control-panel.md`
- Merge authority: Human/user only
- Source issue: `rhgo1749/h4v3-meowcore-avatar-lab#6`
- Kanban task ID: assigned by Hermes intake
- Intake idempotency key: `github:rhgo1749/h4v3-meowcore-avatar-lab:issue:6`
- Planning/lead owner: Luna lead
- Implementation owner: Luna lead and/or delegated Luna workers
- Automation stop state: `HOST_VALIDATION_REQUIRED` only if implementation changes host-only lifecycle behavior; `HUMAN_VALIDATION_REQUIRED` is not expected because no real Cubism model is introduced

## 0. Mandatory repository route

작업 전에 current `main`을 fetch하고 다음을 읽는다.

- `AGENTS.md`
- `.agent/PR_REQUEST_TEMPLATE.md`
- `docs/ARCHITECTURE.md`
- `docs/MOTION-LANGUAGE.md`
- `docs/OUTLINE-RULES.md`
- `docs/SECURITY.md`
- `runtime/public/debug.html`
- `runtime/server/app.js`
- `runtime/server/state.js`
- existing runtime tests/smoke

대화 기억이 아니라 repository baseline을 source of truth로 사용한다.

## 1. Objective

M2로 현재 health/state 확인용 `/debug`를 semantic avatar control test surface로 확장한다.

현재 PR-001 runtime은 placeholder model을 제공하고 `/debug`는 `/healthz`와 `/api/state` 확인만 수행한다. 실제 Cubism model을 도입하기 전에 semantic control/state contract를 먼저 고정하여 M3의 renderer/model adapter가 동일한 API/state layer를 그대로 재사용할 수 있게 한다.

## 2. Required semantic controls

### Continuous / stateful

- `angleX`
- `angleY`
- `bodyX`
- `blink`
- `mouth`
- `smile`
- `squash`
- `bounce`

각 control은 canonical id, default, min, max, clamp policy를 코드 한 곳에서 정의한다. UI와 API가 서로 다른 범위를 따로 하드코딩하지 않는다.

### Discrete / event-like

- `beat`

Beat는 continuous parameter처럼 영구 값을 저장하는 대신 deterministic event/counter/timestamp/state transition 중 현재 runtime 구조에 가장 작은 표현을 택한다. 테스트에서 event 발생을 명확하게 관찰할 수 있어야 한다.

## 3. Runtime ownership and API contract

- Avatar Runtime이 semantic state의 canonical owner다.
- `/debug`는 runtime API를 호출하는 client다.
- Hermes/H4V3-DJ는 이후 동일한 bounded semantic interface를 사용할 수 있어야 한다.
- raw ArtMesh/deformer/Cubism internal parameter id를 public semantic contract로 노출하지 않는다.
- arbitrary command, arbitrary file path, Docker operation을 받는 generic endpoint를 추가하지 않는다.

구현은 현재 runtime 구조를 먼저 조사한 뒤 최소 surface로 정한다. 예를 들어 bounded parameter update/reset/event endpoint를 둘 수 있으나 실제 endpoint naming은 기존 code style과 충돌하지 않게 결정한다.

`GET /api/state`에서는 최소한 현재 semantic control state와 beat 관찰 가능 상태를 deterministic하게 확인할 수 있어야 한다. 기존 model/uptime/request information을 깨지 않는다.

## 4. `/debug` requirements

`runtime/public/debug.html`은 다음을 제공한다.

- Angle X / Y control
- Body X control
- Blink control
- Mouth control
- Smile control
- Squash control
- Bounce control
- Beat trigger button
- Reset-to-defaults action
- 현재 runtime state 표시
- API error를 사용자에게 보이는 failure state로 표시

슬라이더/숫자 입력 등 구체 UI는 단순하고 deterministic하게 유지한다. 이번 PR은 제품용 설정 UI가 아니라 개발/검증 surface다.

조작 후 페이지 내부 상태만 바뀌고 server state가 바뀌지 않는 fake control은 허용하지 않는다.

## 5. Placeholder renderer behavior

실제 Live2D/Cubism model은 아직 없다. 따라서 이번 PR에서 semantic controls가 실제 art deformation을 수행할 필요는 없다.

하지만 model 미탑재 상태에서도:

- runtime state mutation
- clamp/reset semantics
- event semantics
- debug UI ↔ runtime round-trip

은 완전히 검증 가능해야 한다.

실제 renderer mapping은 M3에서 semantic id → Cubism parameter/expression adapter로 연결한다.

## 6. Explicit non-goals

- Cubism SDK/Core vendor
- third-party sample model 추가
- licensed/private artwork 추가
- actual Live2D rendering/model loading
- outline visual-quality PASS
- production H4V3-DJ integration
- full production WebSocket event bus
- arbitrary parameter-id passthrough API
- Docker socket/root/broad sudo/host filesystem privilege 확대

## 7. Architecture/security invariants

- host-served Avatar Runtime 구조 유지
- Hermes와 H4V3-DJ는 clients
- loopback/default network policy 유지
- runtime state와 debug client state를 분리
- semantic contract와 Cubism-specific mapping을 분리
- invalid/non-finite/out-of-range input은 fail-safe하게 reject 또는 clamp하고 계약을 테스트로 고정
- unknown control id는 silently accepted 하지 않음
- malformed JSON/body는 명확한 4xx로 처리

## 8. Validation contract

### Repository/server

필수:

- existing runtime unit/contract tests PASS
- semantic defaults/ranges/clamping/reset tests
- invalid/unknown input tests
- state mutation API contract tests
- beat event observability test
- `/healthz`, `/api/state`, `/` regression tests
- `npm run typecheck` PASS
- `git diff --check` PASS

### Web/browser

필수:

- existing browser smoke 유지
- `/debug` controls 존재 확인
- control 변경 후 server state 반영 확인
- reset 확인
- beat trigger 확인
- console errors 0

### Docker/host

- Docker image/build regression은 repository에서 가능한 범위로 수행
- docs/runtime-only 변경이고 host-exclusive behavior가 없다면 실제 Ubuntu host acceptance는 optional
- host-only lifecycle/network behavior를 변경했다면 `HOST_VALIDATION_REQUIRED`

### Human/Cubism

- NOT APPLICABLE
- 실제 rig/outline/art quality를 PASS로 보고하지 않는다

## 9. Implementation guidance

- current `state.js`/`app.js` 구조를 먼저 조사한다.
- semantic schema/defaults를 중앙화한다.
- state mutation은 process memory에서 deterministic하게 동작하면 충분하다; persistence/database는 추가하지 않는다.
- 불필요한 framework/dependency 도입을 피한다.
- 기존 zero-runtime-dependency 방향을 유지할 수 있으면 유지한다.
- placeholder model state와 semantic control state를 혼동하지 않는다.
- API response는 tests와 이후 adapter가 재사용하기 쉬운 명확한 JSON으로 유지한다.

## 10. Completion criteria

- [ ] 8개 continuous semantic controls의 canonical contract가 존재
- [ ] Beat discrete trigger가 존재하고 state/API에서 관찰 가능
- [ ] `/debug`에서 모든 control 조작 가능
- [ ] Reset-to-defaults 가능
- [ ] control mutation이 server-side canonical state에 반영
- [ ] `/api/state`에서 current semantic state 확인 가능
- [ ] invalid/unknown input safety tests 존재
- [ ] existing runtime/API/browser behavior 회귀 없음
- [ ] real Cubism/model/asset을 추가하지 않음
- [ ] architecture/security docs가 contract 변화만큼 필요한 최소 범위로 갱신됨
- [ ] dedicated branch pushed and exactly one Korean PR opened/updated
- [ ] merge하지 않음

## 11. Final report

최종 handoff에는 다음을 포함한다.

- source issue #6
- request path
- branch/PR
- changed files
- semantic control schema/default/range
- API contract
- beat semantics
- repository/test/browser evidence
- host validation 필요 여부
- M3 model-adapter에 남긴 명확한 extension point
- residual risks
