# PR-002: Host ephemeral validation / persistent deployment 계약 정본화

- Status: Ready
- Project: h4v3-meowcore-avatar-lab
- Product type: TOOLING
- Validation profiles: SERVER_CLI / HOST_RUNTIME
- Base branch: `main`
- Required work branch: `docs/host-validation-deployment-contract`
- Source-of-truth base: latest fetched `origin/main`
- Remote delivery: Required
- Pull request language: Korean
- Request path: `.agent/pr-requests/PR-002-host-validation-deployment-contract.md`
- Merge authority: Human/user only
- Source issue: to be created immediately after this request file
- Kanban task ID: assigned by Hermes intake
- Intake idempotency key: assigned from source Issue number
- Planning/lead owner: Luna lead
- Implementation owner: Luna lead and/or delegated Luna workers
- Automation stop state: NONE unless host validation is needed to prove a changed helper/script

## 0. Mandatory repository route

작업 전에 다음을 읽고 current `main`과 실제 구현을 확인한다.

- `AGENTS.md`
- `.agent/PR_REQUEST_TEMPLATE.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `runtime/README.md`
- `scripts/avatar-runtime`
- PR #3 host acceptance discussion/evidence if GitHub access is available

repository baseline, Hermes development checkout, Ubuntu host validation checkout, persistent production checkout은 서로 다른 source of truth다.

## 1. Objective

PR #3에서 실제로 검증된 운영 흐름을 repository contract로 정본화한다.

```text
Hermes container
└─ canonical development checkout / worktree
   ├─ code changes
   ├─ repository validation
   └─ PR push

Ubuntu Host
├─ /tmp/... ephemeral PR clone
│  └─ exact pull/<PR>/head host acceptance
│
└─ ~/services/h4v3-meowcore-avatar-runtime
   └─ clean main-only persistent deployment checkout
```

핵심 목적은 다음 혼선을 제거하는 것이다.

- Hermes 내부 checkout을 Ubuntu host checkout으로 오인하지 않는다.
- host validation을 위해 Hermes에 Docker socket/root/broad host 권한을 추가하지 않는다.
- 미병합 PR 검증 때문에 persistent production checkout을 branch-switch/worktree 대상으로 사용하지 않는다.
- PR host acceptance는 exact PR head를 `/tmp` ephemeral clone에서 검증한다.
- merge 후에만 persistent deployment checkout을 `main`으로 fast-forward하고 runtime을 rebuild/restart한다.

## 2. Confirmed background

PR #3의 실제 host acceptance에서 다음 사실이 확인됐다.

- canonical development repository는 `hermes-cloudcli-agent` container 안에 있었다.
- 해당 Hermes container에는 Docker CLI와 `/var/run/docker.sock`이 없었고, 이 경계는 의도된 안전 설계다.
- Ubuntu host에서 `/tmp/meowcore-avatar-pr3.*` 임시 clone을 만들어 exact `pull/3/head` SHA를 검증했다.
- Docker build/start, `127.0.0.1:8930`, `/healthz`, `/api/state`, Playwright `/`·`/debug`, stop→start recovery를 host에서 검증했다.
- Hermes container는 `network_mode=host`였고 Hermes 내부에서 `127.0.0.1:8930/healthz` reachability를 검증했다.
- merge 후 검증용 clone을 제거하고 `/home/gonus/services/h4v3-meowcore-avatar-runtime`에 clean `main` persistent checkout을 생성했다.
- persistent deployment는 merged main SHA에서 `status=running health=healthy`, host/Hermes health reachability PASS 상태로 남았다.

현재 문서는 host acceptance를 설명하지만 위의 **ephemeral validation checkout vs persistent deployment checkout** 구분을 agent workflow의 명시적 invariant로 충분히 고정하지 않았다.

## 3. Cross-cutting impact gate

- Security impact: AFFECTED
- Privacy/data impact: NONE
- Auth/permission impact: AFFECTED
- Host/runtime/network impact: AFFECTED
- Third-party asset/license impact: NONE
- Required canonical docs: `AGENTS.md`, `.agent/PR_REQUEST_TEMPLATE.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `runtime/README.md`
- Required evidence: docs consistency + repository checks; helper/script 변경이 있으면 bounded host smoke
- Residual risk / owner: 실제 host 경로/네트워크 mode는 환경별로 다를 수 있으므로 문서가 특정 미검증 경로를 발명하지 않도록 유지

## 4. In scope

1. `AGENTS.md`에 development checkout / ephemeral host validation checkout / persistent deployment checkout의 역할을 명시한다.
2. `.agent/PR_REQUEST_TEMPLATE.md`의 `HOST_VALIDATION_REQUIRED` handoff 계약을 exact PR head 기반 ephemeral clone 절차로 강화한다.
3. `runtime/README.md`의 host acceptance와 post-merge deployment 절차를 분리한다.
4. `docs/ARCHITECTURE.md` 및 `docs/SECURITY.md`에 checkout/runtime ownership 경계를 필요한 최소 범위로 동기화한다.
5. 필요하다면 기존 `scripts/avatar-runtime`의 의미를 문서화하되, 이번 PR에서 범용 remote execution 또는 Docker privilege bridge를 추가하지 않는다.
6. host acceptance 예시는 fail-closed여야 하며 exact PR head identity assertion, diagnostics/rollback, PASS conditions를 분명히 한다.
7. post-merge deployment는 persistent checkout이 `main`에서 clean/fast-forward 상태인지 확인한 뒤 rebuild/restart하도록 문서화한다.

## 5. Explicit non-goals

- Hermes에 Docker socket을 mount하지 않는다.
- Docker daemon TCP exposure, root, broad sudo, host filesystem 권한을 추가하지 않는다.
- persistent deployment checkout을 PR branch/worktree 검증 공간으로 사용하지 않는다.
- 특정 host path가 모든 환경에서 동일하다고 가정하지 않는다. 현재 실제 배치 경로는 예시/confirmed deployment로만 기록한다.
- Avatar Runtime 기능/API/Live2D model behavior를 변경하지 않는다.
- 자동 배포 daemon, CI/CD, webhook, systemd rollout은 이번 PR 범위에 넣지 않는다.
- 사용자 승인 없이 merge/auto-merge하지 않는다.

## 6. Architecture invariants

```text
Windows / Cubism Editor
        │ export / Git
        ▼
Hermes Docker
└─ development checkout / agent workflow
        │ push PR
        ▼
GitHub
        │ exact PR head
        ▼
Ubuntu Host
├─ ephemeral validation clone (/tmp or equivalent bounded temp path)
│  └─ Docker/browser/Hermes reachability acceptance
│
└─ persistent deployment checkout (main only)
   └─ Avatar Runtime :8930
        ▲
        ├─ Hermes client
        └─ H4V3-DJ client (later)
```

**Host = runtime owner. Hermes = engineering/orchestration client.**

## 7. Implementation requirements

- latest fetched `origin/main`에서 dedicated branch/worktree로 작업한다.
- current docs와 scripts를 먼저 조사하고 중복/모순을 제거한다.
- 문서 예시는 `set -euo pipefail` 또는 동등한 fail-closed semantics를 사용한다.
- `ss ... || echo free`처럼 command-not-found를 가짜 PASS로 만들 수 있는 검사 패턴을 금지한다.
- port availability 예시는 실제 bind probe 또는 command presence를 먼저 검증하는 방식이어야 한다.
- exact PR head는 `pull/<N>/head` fetch 후 SHA identity를 assert한다.
- host acceptance 성공 시 runtime을 healthy 상태로 남길지, 검증 전용으로 내릴지 각 절차의 목적을 명확히 한다.
- post-merge deployment와 PR acceptance를 한 block에 혼합하지 않는다.
- persistent checkout에서 branch switch/detached PR validation을 하지 않는다.
- stable contract 변경에 맞춰 canonical docs를 일관되게 갱신한다.

## 8. Validation contract

### Repository / server / CLI
- Applicability: REQUIRED
- Checks: changed docs/scripts consistency; existing repository tests/typecheck where applicable; `bash -n scripts/avatar-runtime` if script touched
- Result: must be recorded in PR

### Web/browser
- Applicability: NOT APPLICABLE unless runtime behavior/script is changed
- If touched, rerun existing Playwright smoke and report actual result

### Host runtime
- Applicability: OPTIONAL for docs-only change; REQUIRED if host helper/lifecycle behavior changes
- Authorized interface: operator-run Ubuntu host shell only; no Docker privilege added to Hermes
- Evidence: exact commands and actual result if run

### Human / Cubism / visual
- Applicability: NOT APPLICABLE

## 9. Luna lead / delegation contract

Luna lead는 current main 문서와 PR #3에서 확정된 실제 topology를 먼저 복구한다. 문서 정합성/보안 경계는 lead가 최종 검토한다. worker가 문서 패치를 제안할 수 있으나, Docker privilege 확대나 host path 일반화를 임의로 도입하면 안 된다. PR은 만들거나 갱신할 수 있으나 merge하지 않는다.

## 10. Understanding handoff

- Confirmed cause: 기존 workflow가 development checkout과 host runtime checkout을 충분히 구분하지 않아 Hermes container 내부에서 host preflight를 실행하는 혼선이 발생했다.
- Before flow: Hermes checkout에서 host validation을 시도하거나, host checkout 존재를 암묵적으로 가정.
- After flow: Hermes development → host ephemeral exact-PR clone acceptance → human merge → persistent main deployment update.
- Repository source of truth: GitHub `main`, Issue, request file, canonical docs.
- Runtime/host source of truth: persistent host deployment checkout + running Docker service.
- Key decision: PR validation clone과 production deployment clone을 분리한다.
- Rejected alternative: Hermes에 Docker socket/host privilege를 추가해 host validation을 대신 수행 — security boundary를 약화하므로 금지.
- First debugging entry point: `AGENTS.md` validation boundary → `runtime/README.md` host acceptance → `scripts/avatar-runtime`.

## 11. Completion criteria

- [ ] checkout 역할 3종(development / ephemeral validation / persistent deployment)이 문서에서 명확히 구분됨
- [ ] PR request template가 exact head + ephemeral host validation contract를 요구함
- [ ] post-merge persistent deployment 절차가 PR acceptance와 분리됨
- [ ] Docker socket/root/broad host privilege 금지 invariant 유지
- [ ] 가짜 PASS를 만들 수 있는 shell 검사 패턴이 예시에서 제거/금지됨
- [ ] canonical docs 사이 모순 없음
- [ ] repository validation 결과 기록
- [ ] 필요한 경우 host validation evidence 기록
- [ ] dedicated branch pushed and exactly one Korean PR opened/updated
- [ ] merge하지 않음

## 12. Final report

### Summary
- Implemented:
- Intentionally not implemented:

### Provenance
- Source issue:
- Kanban task:
- Request path: `.agent/pr-requests/PR-002-host-validation-deployment-contract.md`
- Lead/delegated workers:
- Automation stop state:

### Validation
| Validation | Result | Notes |
|---|---|---|
| Repository/server/CLI | PASS / FAIL / NOT RUN / SKIPPED | |
| Web/browser | PASS / FAIL / NOT RUN / SKIPPED | |
| Host runtime | PASS / FAIL / NOT RUN / SKIPPED | |
| Human/Cubism/visual | NOT APPLICABLE | |

### PR
- Branch: `docs/host-validation-deployment-contract`
- PR number/URL:
- Merge status: NOT MERGED
