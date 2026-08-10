# AGENTS.md — Meowcore Avatar Lab agent operating contract

이 문서는 저장소를 처음 읽는 Hermes/Luna/기타 coding agent가 ephemeral chat memory 없이도 프로젝트 의도, 아키텍처 경계, 검증 기준을 복구할 수 있도록 하는 최상위 계약이다.

## Project purpose

`h4v3-meowcore-avatar-lab`의 최종 목표는 **Meowcore의 cartoon-style Live2D avatar**를 만드는 것이다.

목표 스타일은 일반적인 anime VTuber 문법보다 다음을 우선한다.

- bold and stable outlines
- simple graphic shapes
- strong silhouette
- flat/minimal shading
- exaggerated expressions
- snappy limited-animation timing
- rhythmic motion
- small-screen readability

Live2D는 구현 수단이다. 리깅 편의를 위해 캐릭터의 카툰 정체성을 약화하지 않는다.

## Canonical architecture

```text
Windows / human
└─ Live2D Cubism Editor
      │ export
      ▼
Git repository
      │
      ▼
Ubuntu Host
└─ Avatar Runtime Docker service
      ▲
      │ HTTP / WebSocket
      ├──────── Hermes Docker
      └──────── H4V3-DJ
```

**Non-negotiable architecture rule:**

> Meowcore Avatar Runtime is a host-served service. Hermes and H4V3-DJ are clients.

이 구조는 H4V3의 host-served local-model pattern과 같은 책임 분리를 따른다. runtime dependency를 Hermes container 안에 무리하게 몰아넣지 않는다.

## Source of truth

- Project overview: `README.md`
- Product direction: `docs/VISION.md`
- Runtime topology/API boundaries: `docs/ARCHITECTURE.md`
- Visual rules: `docs/VISUAL-LANGUAGE.md`
- Outline/deformation rules: `docs/OUTLINE-RULES.md`
- Motion rules: `docs/MOTION-LANGUAGE.md`
- Security/host boundary: `docs/SECURITY.md`
- Agentic PR request master: `.agent/PR_REQUEST_TEMPLATE.md`
- Concrete work requests: `.agent/pr-requests/PR-NNN-<slug>.md`

대화에서만 알고 있는 상태를 source of truth로 사용하지 않는다. repository baseline, exported Live2D artifact, host runtime, Cubism Editor working file은 서로 다른 검증 surface다.

## Non-negotiable safety invariants

1. Hermes에 unrestricted Docker daemon 권한을 새로 부여하지 않는다.
2. unauthenticated Docker TCP daemon (`0.0.0.0:2375`)을 열지 않는다.
3. `/var/run/docker.sock`, root, broad sudo, host filesystem 권한은 단순 편의를 위해 추가하지 않는다.
4. Avatar Runtime 제어가 필요하면 bounded script/API를 우선한다.
5. 기본 network exposure는 최소 권한/최소 범위로 유지한다. Tailscale/remote exposure가 필요하면 명시적으로 설계하고 문서화한다.
6. secret/token/password/private key를 source, log, screenshot, issue, PR에 넣지 않는다.
7. third-party sample model, proprietary artwork, Cubism SDK/source/binary를 license/redistribution 상태 확인 없이 vendor하지 않는다.
8. 특정 기존 캐릭터나 독특한 디자인을 복제하지 않는다. reference는 일반 원리 분석에만 사용한다.
9. repository test PASS를 실제 Cubism rig visual quality PASS 또는 production host PASS로 기록하지 않는다.
10. 사람의 미적 판단이 필요한 outline/pose/expression 품질은 자동 PASS로 꾸미지 않는다.
11. destructive Git, recursive delete, host-wide reconfiguration을 수행하지 않는다.
12. base branch에 직접 commit/push하거나 merge/auto-merge하지 않는다. 단, 완전히 빈 저장소를 최초로 seed하는 1회성 초기 commit은 예외로 취급할 수 있으며 이후 모든 변경은 PR workflow를 따른다.

## Required workflow

모든 작업은 다음 순서를 따른다.

1. latest `origin/main`을 fetch하고 authoritative base SHA를 기록한다.
2. `AGENTS.md`와 작업에 필요한 canonical docs를 읽는다.
3. source Issue와 `.agent/pr-requests/` 요청서를 확인한다.
4. dedicated branch/worktree를 만든다.
5. current source/runtime contract를 조사한다.
6. 가장 작은 root-cause 변경을 구현한다.
7. repository validation과 host/manual validation을 분리해 기록한다.
8. branch를 push하고 한국어 PR을 연다.
9. merge는 사용자/사람 권한으로 남긴다.

## Repository / host / human validation boundary

### Repository-verifiable

- source/static checks
- unit/integration/contract tests
- Docker image build
- local served test surface
- API schema/health behavior
- headless browser smoke test
- model manifest/path validation

### Host-verifiable

- Ubuntu host Docker runtime
- actual bind/port reachability
- real GPU/browser/runtime behavior if used
- H4V3-DJ/Hermes connectivity
- systemd/compose lifecycle
- production service coexistence

### Human-only or human-led

- Cubism Editor rigging judgment
- outline quality during deformation
- expression appeal/readability
- final cartoon identity
- whether motion feels like Meowcore rather than generic VTuber motion

권한이 없어 host 검증을 못 하면 `HOST_VALIDATION_REQUIRED`, 미적/GUI 판단이 남으면 `HUMAN_VALIDATION_REQUIRED`로 멈춘다. 검증하지 않은 것을 PASS로 기록하지 않는다.

## Live2D / art handling rules

- source art, layered art, Cubism working file, exported runtime model은 구분한다.
- 대용량/binary asset을 추가하기 전 Git/LFS 및 public-repository suitability를 검토한다.
- public repository에 올리면 안 되는 licensed/private asset은 placeholder/manifest로 대체한다.
- model parameter naming은 코드와 문서에서 일관되게 관리한다.
- outline continuity를 깨는 과도한 mesh deformation보다 안정된 좁은 parameter range + discrete reaction pose를 선호할 수 있다.

## Runtime principles

초기 기본 포트 후보는 `8930`이다. 확정 계약이 아니라 config로 override 가능해야 한다.

권장 surface:

- `GET /healthz`
- `GET /api/state`
- bounded control APIs for reload/expression/motion/parameter
- WebSocket event input for beat/speech/emotion/state
- `/debug`, `/outline-test`, `/expressions`, `/motion`, `/audio-reactive`

API는 임의 파일 경로, arbitrary command, Docker operation을 받아 실행하는 generic escape hatch가 되어서는 안 된다.

## PR request workflow

H4V3의 기존 agentic workflow를 동일하게 사용한다.

```text
GitHub Issue
   ↓
Hermes Kanban intake
   ↓
.agent/pr-requests/PR-NNN-<slug>.md
   ↓
Luna lead / worker
   ↓
work branch
   ↓
GitHub PR
   ↓
human review / host or manual acceptance
   ↓
merge
```

새 작업 요청서는 `.agent/PR_REQUEST_TEMPLATE.md`에서 필요한 항목만 남겨 구체화한다. 새 worker가 이전 대화를 전혀 모른다고 가정하고 intent, constraints, source-of-truth, validation, security boundary를 요청서 안에 남긴다.

## Completion rule

완료 보고에는 최소한 다음이 있어야 한다.

- source issue / request path / branch
- changed files
- architecture/security impact
- repository validation evidence
- host validation evidence or explicit stop state
- human visual validation requirement, if any
- residual risks
- PR URL/number

PR을 만들었다는 사실은 구현 또는 host/manual acceptance가 완료되었다는 뜻이 아니다.
