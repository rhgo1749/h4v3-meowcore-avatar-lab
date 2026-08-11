# Meowcore Avatar Lab Agentic PR Request Template

> Lineage: H4V3 Agentic PR Request Master v7
> Repository specialization: `rhgo1749/h4v3-meowcore-avatar-lab`
> Purpose: GitHub Issue → Hermes Kanban → Luna lead/worker execution

이 파일은 avatar-lab 전용 PR 요청서 생성 템플릿이다. 실제 작업에서는 현재 Issue와 저장소 상태를 조사한 뒤 필요한 항목만 남겨 `.agent/pr-requests/PR-NNN-<slug>.md`로 구체화한다.

새 worker는 이전 대화 맥락을 공유하지 않는다고 가정한다. 구현 의도, 제약, 검증 경계는 Issue, `AGENTS.md`, canonical docs, PR 요청서와 Git 증거만으로 복구 가능해야 한다.

---

# PR-NNN: 한글 제목

- Status: Draft
- Project: h4v3-meowcore-avatar-lab
- Product type: HOST_SERVED_WEB_RUNTIME / LIVE2D_ASSET / TOOLING
- Validation profiles: SERVER_CLI / WEB_BROWSER / HOST_RUNTIME / HUMAN_VISUAL
- Base branch: `main`
- Required work branch: `type/short-description`
- Source-of-truth base: latest fetched `origin/main`
- Remote delivery: Required
- Pull request language: Korean
- Request path: `.agent/pr-requests/PR-NNN-<slug>.md`
- Merge authority: Human/user only
- Source issue: `rhgo1749/h4v3-meowcore-avatar-lab#NNN`
- Kanban task ID:
- Intake idempotency key: `github:rhgo1749/h4v3-meowcore-avatar-lab:issue:NNN`
- Planning/lead owner: Luna lead
- Implementation owner: Luna lead and/or delegated Luna workers
- Automation stop state: NONE / HUMAN_VALIDATION_REQUIRED / HOST_VALIDATION_REQUIRED / BLOCKED

## 0. Mandatory repository route

작업 전에 `AGENTS.md`를 전체 계약으로 사용하고 필요한 canonical 문서를 읽는다.

- `docs/VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/VISUAL-LANGUAGE.md`
- `docs/OUTLINE-RULES.md`
- `docs/MOTION-LANGUAGE.md`
- `docs/SECURITY.md`

repository baseline, exported Live2D artifact, Ubuntu host runtime, Cubism Editor state는 서로 다른 source of truth다.

## 1. Objective

한 PR에서 한 개의 구체적인 결과만 정의한다.

## 2. Confirmed background

- Current repository behavior:
- Defect/limitation:
- Repository evidence:
- Source Issue-only product intent:
- Runtime assumption:
- Human/Cubism assumption:
- Explicit assumptions:

핵심 맥락이 부족하면 추측하지 말고 `BLOCKED`로 멈춘다.

## 3. Cross-cutting impact gate

- Security impact: NONE / AFFECTED / UNCERTAIN
- Privacy/data impact: NONE / AFFECTED / UNCERTAIN
- Auth/permission impact: NONE / AFFECTED / UNCERTAIN
- Host/runtime/network impact: NONE / AFFECTED / UNCERTAIN
- Third-party asset/license impact: NONE / AFFECTED / UNCERTAIN
- Required canonical docs:
- Required evidence:
- Residual risk / owner:

영향이 있거나 불확실하면 `docs/SECURITY.md`와 관련 source를 확인하고 구현/검증에 반영한다.

## 4. In scope

1.
2.
3.

## 5. Explicit non-goals

- 제품 방향을 generic anime-VTuber 스타일로 재설계하지 않는다.
- host-served Avatar Runtime / Hermes client 경계를 임의로 뒤집지 않는다.
- repository 검증을 host 또는 Cubism visual 검증으로 과장하지 않는다.
- 관련 없는 host/service/product 변경을 섞지 않는다.
- base branch에 직접 작업하거나 사용자 승인 없이 merge하지 않는다.

## 6. Architecture invariants

```text
Ubuntu Host
└─ Meowcore Avatar Runtime
       ▲
       │ bounded HTTP / WebSocket / project-owned lifecycle interface
       ├── Hermes Docker
       └── H4V3-DJ
```

Cubism Editor는 human GUI authoring surface다. Hermes는 export 이후 pipeline과 runtime을 재현/검증한다.

Host validation이 필요한 요청은 다음 checkout 경계를 반드시 유지한다.

- Hermes development checkout/worktree: 코드 작업, repository validation, PR push
- Ubuntu host ephemeral validation checkout: exact `pull/<PR>/head`를 detached
  `HEAD`로 검증하는 임시 clone
- Ubuntu host persistent deployment checkout: human merge 이후 clean `main`을
  fast-forward하고 rebuild/restart하는 운영 clone

미병합 PR을 persistent deployment checkout에서 검사하거나, Hermes container에
Docker socket/root/broad host 권한을 추가해 host 검증을 대체하지 않는다.

## 7. Implementation requirements

- latest `origin/main`을 기준으로 작업한다.
- dedicated branch/worktree를 사용한다.
- actual source와 canonical docs를 먼저 조사한다.
- 가장 작은 root-cause 변경을 한다.
- stable contract가 바뀌면 durable docs를 갱신한다.
- visual parameter/motion 변경은 가능한 경우 deterministic test surface를 제공한다.

## 8. Validation contract

### Repository / server / CLI
- Applicability: REQUIRED / OPTIONAL / NOT APPLICABLE
- Checks actually run:
- Result: PASS / FAIL / NOT RUN / SKIPPED

### Web/browser
- Applicability: REQUIRED / OPTIONAL / NOT APPLICABLE
- Built/served candidate:
- Scenario/evidence:
- Result: PASS / FAIL / NOT RUN / SKIPPED

### Host runtime
- Applicability: REQUIRED / OPTIONAL / NOT APPLICABLE
- Authorized interface:
- Evidence actually collected:
- Result: PASS / FAIL / NOT RUN / SKIPPED

### Human / Cubism / visual
- Applicability: REQUIRED / OPTIONAL / NOT APPLICABLE
- Scenario:
- Result: PASS / FAIL / NOT RUN / SKIPPED

Automation states:

- `AUTOMATED_VALIDATION_COMPLETE`: repository-accessible gates passed.
- `HOST_VALIDATION_REQUIRED`: host surface remains outside worker boundary.
- `HUMAN_VALIDATION_REQUIRED`: owner/Cubism/visual judgment remains.
- `BLOCKED`: safe progress requires missing context, permission, dependency or decision.

`HOST_VALIDATION_REQUIRED`이면 운영자가 그대로 실행 가능한 최소 host acceptance procedure, expected PASS conditions, failure diagnostics와 recovery를 PR/final report에 남긴다.

그 procedure는 다음을 명시해야 한다.

- `pull/<PR>/head` fetch와 checked-out SHA의 exact identity assertion
- ephemeral clone 생성/정리와 persistent deployment checkout 미사용
- Docker build/start/status, host health/API, 필요한 bounded Hermes reachability,
  browser smoke, stop→start recovery의 PASS 조건
- `set -euo pipefail` 또는 동등한 fail-closed semantics와 마지막 성공 marker
- command-not-found/required-gate 실패 시 PASS를 출력하지 않는 diagnostics/rollback
- human merge 이후에만 실행하는 persistent `main` clean/fast-forward/rebuild/
  restart 절차를 acceptance block과 분리

## 9. Luna lead / delegation contract

Luna lead는 Source Issue, `AGENTS.md`, canonical route를 먼저 읽고 current main/source를 조사한다. 작은 작업은 직접 수행하고 bounded research/implementation/test를 worker에게 위임할 수 있다. delegated output은 diff, source-of-truth, validation을 다시 검토한다. PR은 만들거나 갱신할 수 있으나 merge하지 않는다.

## 10. Understanding handoff

- Confirmed cause:
- Before flow:
- After flow:
- Repository source of truth:
- Runtime/host source of truth:
- Human/Cubism source of truth:
- Key decision:
- Rejected alternative and reason:
- First debugging entry point:

## 11. Completion criteria

- [ ] Issue / Kanban / request provenance recorded
- [ ] ephemeral chat 없이 intent/constraints 복구 가능
- [ ] latest `origin/main` base와 dedicated branch 사용
- [ ] `AGENTS.md`와 canonical route 준수
- [ ] cross-cutting impact gate 평가
- [ ] repository/host/human validation claims 분리
- [ ] 필요한 자동 검증 결과 기록
- [ ] 필요한 host/manual gate verified 또는 explicit stop state
- [ ] host acceptance가 필요하면 exact PR head ephemeral clone과 fail-closed handoff 기록
- [ ] post-merge persistent deployment는 `main` clean/fast-forward 절차로 분리
- [ ] work branch pushed and exactly one Korean PR opened/updated
- [ ] PR not merged without authorization

## 12. Final report

### Summary
- Implemented:
- Intentionally not implemented:

### Provenance
- Source issue:
- Kanban task:
- Request path:
- Lead/delegated workers:
- Automation stop state:

### Files changed
- `path`: reason

### Validation
| Validation | Result | Notes |
|---|---|---|
| Repository/server/CLI | PASS / FAIL / NOT RUN / SKIPPED | |
| Web/browser | PASS / FAIL / NOT RUN / SKIPPED | |
| Host runtime | PASS / FAIL / NOT RUN / SKIPPED | |
| Human/Cubism/visual | PASS / FAIL / NOT RUN / SKIPPED | |

### PR
- Branch:
- PR number/URL:
- Merge status: NOT MERGED
