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
served as a Docker service via `compose.yaml`. Config: `AVATAR_BIND` /
`AVATAR_PORT` (default `127.0.0.1:8930`, invalid values fail fast). See
`runtime/README.md` for commands and validation.

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

## Validation layers

1. Repository: source/tests/build/API contracts.
2. Local served candidate: browser + API behavior.
3. Ubuntu host: actual Docker/network/service lifecycle.
4. Human/Cubism: visual quality and rig judgment.
5. Production integration: H4V3-DJ event flow.

Evidence from one layer must not be reported as proof for another.
