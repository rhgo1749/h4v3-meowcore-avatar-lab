# h4v3-meowcore-avatar-lab

> Cartoon-style Live2D avatar research and runtime for Meowcore.

This repository defines Meowcore's **visual identity, Live2D rigging rules, motion language, and host-served avatar runtime**.

The target is deliberately not a conventional anime-style VTuber model. Meowcore should read as a bold 2D cartoon character: clear outlines, simple graphic shapes, strong silhouette, exaggerated expressions, and snappy rhythmic motion.

## Core principle

> The rig exists to animate the cartoon. The cartoon is not redesigned merely to make the rig easier.

Live2D is the implementation medium, not the visual style.

## Architecture

The runtime follows the same separation used elsewhere in H4V3 for host-served capabilities such as local model serving:

```text
Windows / human GUI
└─ Live2D Cubism Editor
      │ export
      ▼
Git repository
      │
      ▼
Ubuntu Host
└─ Meowcore Avatar Runtime (Docker)
      ├─ renderer
      ├─ model loader
      ├─ parameter / expression / motion control
      ├─ debug viewer
      └─ health + control API
             ▲
             │ HTTP / WebSocket
        ┌────┴─────┐
        │          │
Hermes Docker    H4V3-DJ
engineering      broadcast client
validation
```

**Architecture rule:** `Meowcore Avatar Runtime is a host-served service. Hermes and H4V3-DJ are clients.`

Hermes should be able to reproduce source changes, tests, API calls, validation, and runtime diagnostics without needing to reproduce the Cubism Editor GUI.

## Design pillars

- bold, visually stable outlines
- strong silhouette at small sizes
- flat or minimally shaded graphic shapes
- exaggerated, readable expressions
- deliberate limited-animation timing
- rhythmic bounce / snap / hold / pop motion
- low dependence on decorative secondary physics
- motion that preserves the drawing instead of making it look rubbery

The project may study general principles from rhythm games, limited animation, mascot design, editorial cartoons, and graphic 2D animation. It must not copy an existing character, proprietary artwork, or a distinctive protected design.

## Repository boundaries

This repository owns:

- Meowcore visual-language documentation
- outline/deformation rules
- Live2D model/export conventions
- avatar runtime and debug surfaces
- expression/motion contracts
- rhythm-reactive avatar experiments
- H4V3-DJ-facing avatar control interface

It does **not** own:

- TTS/voice research (`h4v3-meowcore-voice-lab`)
- DJ/broadcast orchestration (`H4V3-DJ`)
- Meowcore's conversational LLM/brain
- Cubism Editor itself

## Canonical documents

- Agent operating contract: [`AGENTS.md`](AGENTS.md)
- Product vision: [`docs/VISION.md`](docs/VISION.md)
- Runtime architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Visual language: [`docs/VISUAL-LANGUAGE.md`](docs/VISUAL-LANGUAGE.md)
- Outline/deformation contract: [`docs/OUTLINE-RULES.md`](docs/OUTLINE-RULES.md)
- Motion language: [`docs/MOTION-LANGUAGE.md`](docs/MOTION-LANGUAGE.md)
- Security/runtime boundaries: [`docs/SECURITY.md`](docs/SECURITY.md)
- Runtime implementation: [`runtime/README.md`](runtime/README.md)
- Agentic PR request template: [`.agent/PR_REQUEST_TEMPLATE.md`](.agent/PR_REQUEST_TEMPLATE.md)

## Implemented runtime surface (PR-001)

The bootstrap runtime ships a deterministic placeholder (no Live2D model):

```text
GET /healthz   machine-readable readiness JSON
GET /api/state real runtime state (placeholder model)
GET /          clean avatar output surface
GET /debug     validation surface
```

- Docker service: `compose.yaml` (host bind `AVATAR_HOST_BIND`, loopback-only by default)
- Bounded lifecycle: `./scripts/avatar-runtime start|stop|restart|status|logs`
- Config: `AVATAR_BIND` (bare process), `AVATAR_HOST_BIND` (compose host exposure), `AVATAR_PORT` (default `127.0.0.1:8930`, loopback-only)

Full commands and validation instructions: `runtime/README.md`.

## Planned runtime surface

The exact API is not frozen yet, but the initial direction is:

```text
GET  /healthz
GET  /api/state
POST /api/reload
POST /api/expression
POST /api/motion
POST /api/parameter
WS   /ws/events

/                 avatar output
/debug            parameter controls
/expressions      expression QA
/motion           motion QA
/outline-test     deformation / outline torture test
/audio-reactive   BPM / beat experiments
```

Initial development port candidate: `8930`. Secure binding and remote access policy are defined in `docs/SECURITY.md`.

## Development stages

1. **Repository + contract bootstrap** — canonical docs and agent workflow
2. **Avatar Runtime skeleton** — Dockerized host service, health/debug surface
3. **Placeholder model path** — deterministic model loading contract
4. **Outline torture test** — deformation QA and parameter ranges
5. **Cartoon Live2D prototype** — first real Meowcore rig/export
6. **Rhythm reactive motion** — beat/BPM/event input
7. **H4V3-DJ integration** — production avatar client

## Current status

🚧 Early bootstrap. The repository contract is in place and the **Avatar
Runtime skeleton** (PR-001) is the first implementation stage: a Dockerized
host service with `/healthz`, `/api/state`, `/`, `/debug`, env-based
bind/port, a bounded lifecycle script, and a placeholder model path — all
verifiable without any Live2D asset.

No production Live2D model, rig, or production avatar runtime is implied by
the repository existing. Host deployment acceptance (real Docker lifecycle
on the Ubuntu host) is an operator gate (`HOST_VALIDATION_REQUIRED`).
