# Architecture

## Canonical topology

```text
Windows / human workstation
└─ Live2D Cubism Editor
      │ exported runtime model
      ▼
Git repository / approved artifact path
      │
      ▼
Ubuntu Host
└─ Meowcore Avatar Runtime (Docker)
      ├─ renderer
      ├─ model loader
      ├─ state / parameter controller
      ├─ expression + motion controller
      ├─ debug/test pages
      └─ HTTP + WebSocket interface
             ▲
             │
        ┌────┴────────────┐
        │                 │
Hermes Docker          H4V3-DJ
engineering client     broadcast client
```

The runtime follows the same general separation as host-served local model infrastructure: the Ubuntu host provides a capability as a service; Hermes consumes and manages it through a bounded interface rather than embedding the whole runtime inside the Hermes container.

## Checkout ownership

The runtime topology has three different checkout roles:

```text
Hermes container
└─ development checkout/worktree
   └─ source changes, repository validation, PR push

Ubuntu host
├─ ephemeral validation checkout
│  └─ exact GitHub pull/<PR>/head acceptance before merge
│
└─ persistent deployment checkout
   └─ clean merged main only; rebuild/restart after human merge
```

The ephemeral checkout is disposable and must fetch/assert the exact PR head
before it builds or starts the runtime. The persistent deployment checkout is
not a PR review workspace: it is advanced only after the PR is merged, with a
clean `main` fast-forward to `origin/main`. A host acceptance result from the
ephemeral checkout does not imply that the persistent service has been
deployed.

## Responsibilities

### Ubuntu host / Avatar Runtime

Owns:

- renderer process
- model loading
- runtime state
- expression/motion execution
- WebSocket event consumption
- browser/debug surfaces
- health reporting

Initial port candidate: `8930`, configurable by environment.

### Hermes

Owns engineering tasks, not the product runtime itself:

- repository modification
- tests and static validation
- build/release automation
- API/health calls
- headless browser QA where possible
- model manifest validation
- bounded lifecycle operations if explicitly provided by this repository
- PR creation and evidence collection

Hermes does not receive generic host root or unrestricted Docker control simply to perform these tasks.

### H4V3-DJ

Eventually consumes the Avatar Runtime as a production client and sends structured events such as:

- speech start/end
- expression/emotion
- DJ state
- beat/downbeat
- BPM/energy

The Avatar Runtime must not become the conversational brain or DJ scheduler.

### Human / Cubism Editor

Owns GUI-only and aesthetic operations:

- art preparation
- mesh/deformer work
- rigging
- parameter authoring
- final outline and deformation judgment
- expression appeal/readability

The exported artifact becomes the runtime input. Hermes is expected to reproduce and validate the post-export pipeline, not the Cubism GUI editing session.

## Implemented interface (PR-001)

Bootstrap runtime with a deterministic placeholder (no Live2D model yet):

```text
GET /healthz   machine-readable readiness JSON (status/ready/version/model)
GET /api/state real runtime state (placeholder model, counters)
GET /          clean avatar output surface
GET /debug     validation surface
```

Implementation lives in `runtime/` (Node.js, zero runtime dependencies),
served as a Docker service via `compose.yaml`. Config: `AVATAR_BIND`
(bare-process listen, default `127.0.0.1`), `AVATAR_HOST_BIND` (compose host
publish bind, default `127.0.0.1`, loopback-only; `0.0.0.0` is explicit
opt-in external exposure) and `AVATAR_PORT` (default `8930`, invalid values
fail fast). See `runtime/README.md` for commands and validation.

## Planned interface

This is a direction, not yet a frozen production API. PR-001 deliberately
implements only the endpoints above; the following appear together with
real model/controller semantics, never as fake stubs:

```text
POST /api/reload
POST /api/expression
POST /api/motion
POST /api/parameter
WS   /ws/events
```

Potential browser surfaces:

```text
/                 clean avatar output
/debug            raw parameter controls
/expressions      expression matrix
/motion           motion test harness
/outline-test     deformation torture test
/audio-reactive   BPM/beat/event tests
```

## State model principle

The service is stateful. Unlike a request/response text provider, avatar state persists across events. APIs should therefore define ownership, bounded parameter ranges and transition semantics rather than expose arbitrary low-level commands.

## Lifecycle principle

Prefer a project-owned bounded lifecycle entry point. PR-001 provides:

```text
./scripts/avatar-runtime status
./scripts/avatar-runtime start
./scripts/avatar-runtime stop
./scripts/avatar-runtime restart
./scripts/avatar-runtime logs
```

The script drives only the repository-owned compose service
(`compose.yaml`); it never touches unrelated containers, the Docker daemon
configuration, or host state. `status` also verifies the configured port
directly when Docker is not available. Callers should not require
unrestricted Docker daemon access.

## Host acceptance and persistent deployment flow

Before merge, an operator runs the host acceptance procedure from the
ephemeral exact-PR checkout. The procedure is fail-closed: required command
presence, exact SHA identity, Docker lifecycle, health/API responses, bounded
client reachability, browser smoke, and recovery must all succeed before its
explicit PASS marker is printed. Failure diagnostics and a project-scoped
service stop/rollback path are separate from the success block.

After human merge, the operator separately verifies that the persistent
checkout is the expected repository, on clean `main`, and fast-forwarded to
the fetched `origin/main` before rebuilding/restarting the service. No PR
branch, detached PR ref, or development checkout is used for that deployment
step. See `runtime/README.md` for the operator procedures and their distinct
validation claims.

## Validation layers

1. Repository: source/tests/build/API contracts.
2. Local served candidate: browser + API behavior.
3. Ubuntu host: actual Docker/network/service lifecycle.
4. Human/Cubism: visual quality and rig judgment.
5. Production integration: H4V3-DJ event flow.

Evidence from one layer must not be reported as proof for another.
