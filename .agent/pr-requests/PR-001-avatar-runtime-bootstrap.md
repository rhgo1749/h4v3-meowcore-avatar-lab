# PR-001: Host-served Meowcore Avatar Runtime 부트스트랩

- Status: Draft
- Project: h4v3-meowcore-avatar-lab
- Product type: HOST_SERVED_WEB_RUNTIME
- Validation profiles: SERVER_CLI / WEB_BROWSER / HOST_RUNTIME
- Base branch: `main`
- Required work branch: `feat/avatar-runtime-bootstrap`
- Source-of-truth base: latest fetched `origin/main`
- Remote delivery: Required
- Pull request language: Korean
- Request storage: REPOSITORY_OWNED_REQUEST
- Request path: `.agent/pr-requests/PR-001-avatar-runtime-bootstrap.md`
- Merge authority: Human/user only
- Source issue: `rhgo1749/h4v3-meowcore-avatar-lab#1`
- Source issue URL: `https://github.com/rhgo1749/h4v3-meowcore-avatar-lab/issues/1`
- Kanban task ID: to be assigned at intake
- Intake idempotency key: `github:rhgo1749/h4v3-meowcore-avatar-lab:issue:1`
- Planning/lead owner: Luna lead
- Implementation owner: Luna lead and/or delegated Luna workers
- Automation stop state: HOST_VALIDATION_REQUIRED unless an authorized host acceptance path is available

## 0. Mandatory repository route

작업 전에 반드시 읽는다.

- `AGENTS.md`
- `docs/VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/VISUAL-LANGUAGE.md`
- `docs/OUTLINE-RULES.md`
- `docs/MOTION-LANGUAGE.md`
- `docs/SECURITY.md`

이 요청은 이전 ChatGPT 대화를 모르는 worker가 실행할 수 있어야 한다.

## 1. Objective

Ubuntu 호스트에서 Docker service로 실행되고 Hermes가 API/browser validation client로 접근할 수 있는 **최소 Meowcore Avatar Runtime skeleton**을 구현한다.

이번 PR의 목적은 실제 최종 Live2D 모델을 완성하는 것이 아니라, 이후 Cubism export와 카툰형 Live2D 모델을 안정적으로 적재·검증할 수 있는 host-served runtime 경계를 먼저 확립하는 것이다.

## 2. Confirmed background

Meowcore Avatar의 최종 목표는 conventional anime VTuber가 아니라 다음 특징을 가진 Live2D 캐릭터다.

- bold, clear outline
- strong silhouette
- flat/simple graphic shapes
- exaggerated expression
- limited-animation-like timing
- rhythmic snap / hold / bounce
- outline stability over wide pseudo-3D rotation

현재 H4V3의 local model serving처럼 **무거운 실제 runtime은 Ubuntu host가 서비스하고 Hermes Docker는 client/orchestrator로 소비하는 separation**을 재사용한다.

Canonical direction:

```text
Windows / Cubism Editor
        │ export
        ▼
Git / approved model artifact
        │
        ▼
Ubuntu Host
└─ Avatar Runtime Docker
       ▲
       │ HTTP / WebSocket
       ├── Hermes Docker
       └── H4V3-DJ (future production client)
```

Hermes가 Cubism Editor GUI를 재현해야 한다고 가정하지 않는다. Hermes가 재현해야 하는 것은 export 이후의 build/load/test/runtime pipeline이다.

## 3. In scope

1. 프로젝트에 적합한 최소 web runtime stack을 조사하고 선택 근거를 문서화한다.
2. `avatar-runtime` Docker service를 추가한다.
3. 초기 기본 포트 후보 `8930`을 config/env로 override 가능하게 한다.
4. 최소 `GET /healthz` endpoint를 제공한다.
5. `/` clean output surface와 `/debug` validation surface를 제공한다.
6. 실제 Meowcore Live2D asset이 없어도 build/smoke test 가능한 deterministic placeholder를 사용한다.
7. 향후 model loader / expression / motion / parameter / WebSocket event API를 넣을 구조를 준비하되, 이번 PR에서 불필요한 범용 API를 과구현하지 않는다.
8. Hermes가 repository 차원에서 build/test/browser smoke를 재현할 수 있는 명령을 문서화한다.
9. host lifecycle이 필요하면 project-owned bounded entry point를 제공한다.
10. README/architecture/security docs를 실제 구현과 동기화한다.

## 4. Explicit non-goals

- 최종 Meowcore character art 제작
- Cubism Editor GUI automation
- 실제 production Live2D rig 완성
- H4V3-DJ production wiring
- beat/BPM reactive motion 완성
- face tracking 완성
- final expression set 완성
- third-party sample character를 실제 Meowcore placeholder처럼 배포
- host architecture를 Hermes-contained runtime으로 전환

## 5. Runtime / security boundary

`docs/SECURITY.md`를 따른다.

특히 이번 PR은 **Avatar Runtime 자체의 reproducible container/service**를 만드는 것이지 Hermes에 host-wide control을 주는 작업이 아니다.

Remote browser access는 향후 Tailscale 등 승인된 경로로 확장할 수 있지만, 이번 PR에서 단순 편의를 위해 debug/control surface를 무제한 외부 노출하지 않는다.

Public repository이므로 third-party SDK/sample model/binary asset을 추가해야 한다면 정확한 배포 적합성을 먼저 확인한다. 불명확하면 placeholder와 acquisition/integration instructions로 남긴다.

## 6. Technical direction

구현 stack은 worker가 현재 공식/유지보수 상태와 repository needs를 조사해 결정할 수 있다. 다만 다음 조건을 만족해야 한다.

- browser-renderable
- Docker reproducible
- headless browser smoke test 가능
- future Live2D model loading path를 수용 가능
- HTTP health/status 제공 가능
- future WebSocket event input 수용 가능
- H4V3-DJ/Hermes와 독립 deploy 가능

실제 Live2D SDK integration이 이번 PR의 최소 skeleton에 필수적이지 않다면 억지로 vendor하지 않는다. skeleton이 먼저 안정적으로 뜬 뒤 후속 PR에서 model runtime을 붙여도 된다.

## 7. Expected initial surface

최소:

```text
GET /healthz
/
/debug
```

`/healthz`는 기계 판독 가능한 JSON을 반환하고 service readiness를 구분할 수 있어야 한다.

향후 호환을 고려할 수 있는 이름:

```text
GET  /api/state
POST /api/reload
POST /api/expression
POST /api/motion
POST /api/parameter
WS   /ws/events
```

단, 이번 PR에서 실제 semantics가 없는 endpoint를 가짜 구현으로 늘어놓지 않는다.

## 8. Validation contract

### Repository / server / CLI — REQUIRED

최소 검증:

- dependency/install reproducibility
- source/static/type/lint check, applicable한 경우
- unit/contract tests, applicable한 경우
- Docker image build
- container start + `/healthz` smoke
- clean shutdown

### Web/browser — REQUIRED

최소 검증:

- `/` load 성공
- `/debug` load 성공
- fatal console error 없음
- health/runtime state가 UI와 모순되지 않음
- headless browser에서 deterministic smoke 가능

실제 Live2D model이 없으면 placeholder라는 사실을 명확히 표시한다.

### Host runtime — REQUIRED

Ubuntu production host에서 실제 compose/container lifecycle, port bind, Hermes-side reachability가 확인되어야 최종 host acceptance다.

worker에게 해당 host 권한/경로가 없다면 `HOST_VALIDATION_REQUIRED`로 멈추고 operator가 그대로 실행할 수 있는 최소 acceptance command와 PASS conditions를 PR에 남긴다.

### Human / visual — NOT APPLICABLE for PR-001

이번 PR은 final art/rig quality acceptance를 요구하지 않는다.

## 9. Host acceptance target

운영자 검증은 최소 다음을 확인해야 한다.

- 기존 H4V3 서비스와 포트 충돌 없이 Avatar Runtime 기동
- `/healthz` ready
- Hermes environment에서 bounded network path로 health 확인 가능
- `/`와 `/debug`를 승인된 브라우저 경로에서 열 수 있음
- stop/restart 후 동일하게 복구
- 다른 방송/LLM/service를 불필요하게 재시작하지 않음

정확한 command는 실제 구현 결과에 맞춰 PR final report에서 생성한다.

## 10. Completion criteria

- [ ] latest `origin/main` 기반 dedicated worktree/branch
- [ ] stack 선택 근거 문서화
- [ ] Dockerized `avatar-runtime` skeleton
- [ ] configurable bind/port
- [ ] machine-readable `/healthz`
- [ ] `/` + `/debug` browser surfaces
- [ ] deterministic placeholder path
- [ ] repository build/test/smoke PASS
- [ ] headless/browser smoke evidence
- [ ] security/runtime boundary 보존
- [ ] docs synchronized
- [ ] host runtime verified 또는 explicit `HOST_VALIDATION_REQUIRED` handoff
- [ ] exactly one Korean PR opened
- [ ] PR not merged automatically

## 11. Understanding handoff

- Before: avatar-lab은 design/runtime architecture 문서만 있고 실행 서비스가 없다.
- After: Ubuntu host에서 독립 서비스로 올릴 수 있는 최소 Avatar Runtime candidate가 존재한다.
- Repository source of truth: runtime source + Docker/build/test files.
- Host source of truth: 실제 실행 중 container/service health.
- Human/Cubism source of truth: 이번 PR에서는 범위 밖.
- Key decision: host-served runtime / Hermes client separation 유지.
- First debugging entry point: service logs + `GET /healthz` + `/debug`.

## 12. Final report requirements

반드시 다음을 보고한다.

- selected stack and why
- files changed
- exact build/test/smoke commands
- browser evidence
- runtime/network/security assumptions
- host validation result or operator acceptance handoff
- residual risks / next recommended PR
- PR number/URL
- merge status: NOT MERGED
