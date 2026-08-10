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
    compose.test.js  compose bind-contract tests (AVATAR_HOST_BIND etc.)
    public.test.js   public-surface XSS guard (no innerHTML)
  smoke/
    browser-smoke.js headless chromium smoke (Playwright, run with server up)
  Dockerfile     node:22-alpine, HEALTHCHECK, non-root (USER node)
```

Repository root additionally owns:

```text
compose.yaml             avatar-runtime service (AVATAR_HOST_BIND host bind)
scripts/avatar-runtime   bounded lifecycle entry point
```

## Configuration

Environment variables (see `.env.example` at repository root). Bind is split
into a process knob and a compose host knob so the documented default stays
loopback-only in every path:

```text
AVATAR_BIND        default 127.0.0.1  process listen bind (bare `node` runs/tests)
AVATAR_HOST_BIND   default 127.0.0.1  compose HOST publish bind (loopback-only;
                                     0.0.0.0 = explicit opt-in external exposure)
AVATAR_PORT        default 8930       integer 1..65535, invalid values fail fast
```

In the compose path (`compose.yaml`) the container-internal listen is fixed to
`0.0.0.0` — that is required so the published port mapping can reach it, and it
is not the exposure control. Exposure is governed by `AVATAR_HOST_BIND` on the
host side only; the default remains loopback-only per `docs/SECURITY.md`.

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
npm run typecheck        # tsc --checkJs over server/test/smoke (typescript + @types/node devDeps)
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

- default bind is loopback-only (`AVATAR_HOST_BIND=127.0.0.1`); external
  exposure is explicit opt-in (`AVATAR_HOST_BIND=0.0.0.0`)
- static serving resolves inside `public/` (path traversal rejected)
- container runs as non-root (`USER node`), read-only rootfs,
  `no-new-privileges`, no host sockets/volumes
- the API has no arbitrary command/path/Docker escape hatches
- no secrets, no third-party assets vendored (placeholder only)

See `docs/SECURITY.md` for the full policy.

## Host acceptance (operator)

Docker image build + real host lifecycle (port bind, restart recovery,
Hermes-side reachability, coexistence with other H4V3 services) is
`HOST_VALIDATION_REQUIRED` for the automation boundary. Run this single
procedure on the Ubuntu host from a terminal inside this repository checkout:

```bash
# 1) PR branch를 정확히 fetch/checkout (merge 전이므로 origin/main이 아님)
git fetch origin
git checkout feat/avatar-runtime-bootstrap   # PR-001 work branch (PR #3 head)
git status                                   # clean + branch 확인

# 2) 이미지 build + 서비스 start
./scripts/avatar-runtime start

# 3) 컨테이너 상태 + host /healthz
./scripts/avatar-runtime status              # compose ps + "healthz: OK" 출력

# 4) host에서 직접 확인
curl -fsS http://127.0.0.1:8930/healthz      # {"status":"ok","ready":true,...}

# 5) Hermes 환경에서 bounded network path로 /healthz 도달 확인
docker exec hermes-cloudcli-agent wget -qO- http://127.0.0.1:8930/healthz
#   (Hermes 컨테이너가 host network를 공유하지 않으면, Hermes가 호스트
#    서비스를 소비하는 기존 bounded 경로로 동일하게 확인)

# 6) 승인된 브라우저 경로로 / 와 /debug 열기
#    http://127.0.0.1:8930/        -> "No Live2D model loaded" placeholder + runtime ok
#    http://127.0.0.1:8930/debug   -> health/state checks 모두 ok

# 7) stop -> start 복구
./scripts/avatar-runtime stop
./scripts/avatar-runtime start
./scripts/avatar-runtime status              # 동일한 health 회복 확인

# 8) 진단 / 롤백
./scripts/avatar-runtime logs                # 필요시 로그 확인
./scripts/avatar-runtime stop                # 롤백 = compose down (host 변경 없음)
```

PASS conditions — 모두 충족해야 한다:

- container 기동 + `GET /healthz`가 `{"status":"ok","ready":true,...}` 반환
- host curl과 Hermes-side reachability 모두 OK
- `/`·`/debug`를 승인된 브라우저 경로에서 열 수 있음 (placeholder 명시)
- `stop` → `start` 후 동일 health 복구
- 기존 H4V3 서비스/포트 8930 충돌 없음, 다른 서비스 재시작 없음
- 롤백: `./scripts/avatar-runtime stop`만으로 원복
