# Avatar Runtime (PR-001 bootstrap)

Host-served Meowcore Avatar Runtime skeleton. Ubuntu-host Docker service;
Hermes and H4V3-DJ are HTTP/WebSocket clients (see `docs/ARCHITECTURE.md`).

PR-001 deliberately ships a **deterministic placeholder**: no real Live2D
model is loaded yet. The repository boundary, health surface, config path,
and build/test/smoke pipeline are the deliverables of this PR.

## Stack selection (why Node.js, zero runtime dependencies)

Requirements from `.agent/pr-requests/PR-001-avatar-runtime-bootstrap.md`:

| Requirement | Choice |
|---|---|
| browser-renderable | static HTML/JS served by the runtime |
| Docker reproducible | `node:22-alpine` image, lockfile-pinned |
| headless browser smoke | Playwright + chromium (dev-only) |
| future Live2D model loading | Live2D browser SDKs are JS/WASM — a Node server is the natural host for the future renderer bundle |
| HTTP health/status | built-in `node:http` |
| future WebSocket events | Node `ws` ecosystem available when semantics exist |
| independent deployment | own compose service, loopback-exposed by default |

Using only the Node.js standard library (`node:http`, `node:test`) keeps the
runtime dependency-free: no supply-chain surface, tiny image, reproducible
anywhere with Node >= 20. A framework (Express/Fastify) adds nothing for the
current four routes.

Rejected: bundling a Live2D SDK now (no licensed model asset yet, no
semantics to implement — would be a fake endpoint); Python/FastAPI (fine
HTTP-wise but the future renderer path is JS/WASM).

## Layout

```text
runtime/
  server/
    config.js    AVATAR_BIND / AVATAR_PORT loading (defaults 127.0.0.1:8930)
    state.js     runtime state singleton (placeholder model contract slot)
    app.js       HTTP handler (routing, static serving, traversal guard)
    server.js    entry point + graceful SIGTERM/SIGINT shutdown
  public/
    index.html   clean avatar output surface (/)
    debug.html   validation surface (/debug)
  test/
    app.test.js      route/contract tests (node:test)
    config.test.js   env config tests
  smoke/
    browser-smoke.js headless chromium smoke (Playwright, run with server up)
  Dockerfile     node:22-alpine, HEALTHCHECK, non-root (USER node)
```

Repository root additionally owns:

```text
compose.yaml             avatar-runtime service (loopback-only host bind)
scripts/avatar-runtime   bounded lifecycle entry point
```

## Configuration

Environment variables (see `.env.example` at repository root):

```text
AVATAR_BIND   default 127.0.0.1   loopback-only unless overridden
AVATAR_PORT   default 8930        integer 1..65535, invalid values fail fast
```

Inside the container the app binds `0.0.0.0:8930`; the host-side exposure is
controlled by the compose port mapping (`127.0.0.1:${AVATAR_PORT:-8930}:8930`),
so the default remains loopback-only per `docs/SECURITY.md`.

## HTTP surface (PR-001, actual semantics only)

```text
GET /healthz   machine-readable readiness JSON (status/ready/version/model)
GET /api/state real runtime state (placeholder model, counters)
GET /          clean avatar output surface
GET /debug     validation surface (runs health + state checks in-page)
```

Deliberately **not** implemented yet: reload/expression/motion/parameter
endpoints and `/ws/events`. They will appear only together with real model
loader/controller semantics (no fake endpoints).

## Run / test / smoke

Local development (no Docker needed):

```bash
cd runtime
npm install
npm test                 # node:test unit/contract tests
npm start                # server on 127.0.0.1:8930 (AVATAR_BIND/AVATAR_PORT override)
curl http://127.0.0.1:8930/healthz
```

Headless browser smoke (one-time browser download):

```bash
cd runtime
npx playwright install chromium
# with the server running (npm start):
npm run smoke:browser
# expect: BROWSER SMOKE PASS, console errors: 0
```

Docker service (host with Docker):

```bash
./scripts/avatar-runtime start      # docker compose up -d --build
./scripts/avatar-runtime status     # compose ps + /healthz check
./scripts/avatar-runtime logs
./scripts/avatar-runtime stop
./scripts/avatar-runtime restart
```

`scripts/avatar-runtime status` also works without Docker by checking the
configured port directly (useful when running `npm start` locally).

## Security boundary

- default bind is loopback-only; compose publishes `127.0.0.1` only
- static serving resolves inside `public/` (path traversal rejected)
- container runs as non-root (`USER node`), read-only rootfs,
  `no-new-privileges`, no host sockets/volumes
- the API has no arbitrary command/path/Docker escape hatches
- no secrets, no third-party assets vendored (placeholder only)

See `docs/SECURITY.md` for the full policy.

## Host acceptance (operator)

Docker image build + real host lifecycle (port bind, restart recovery,
coexistence with other H4V3 services) is `HOST_VALIDATION_REQUIRED` for the
automation boundary. The minimal acceptance procedure lives in the PR-001
final report; expected PASS conditions:

- container starts and `GET /healthz` returns `"status": "ok"`
- `/` and `/debug` open on the host's approved browser route
- `stop` then `start` restores the same health
- no unrelated service restart or port conflicts (8930)
