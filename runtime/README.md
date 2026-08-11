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
npm ci                     # lockfile 강제 설치 (package-lock.json 커밋됨)
npm test                   # node:test unit/contract tests
npm run typecheck          # tsc --checkJs over server/test/smoke (typescript + @types/node devDeps)
npm start                  # server on 127.0.0.1:8930 (AVATAR_BIND/AVATAR_PORT override)
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
./scripts/avatar-runtime logs       # recent logs (non-blocking tail)
./scripts/avatar-runtime logs -f    # follow logs (interactive only)
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

## Host acceptance (operator; pre-merge)

Docker image build + real host lifecycle (port bind, restart recovery,
bounded Hermes-side reachability, and coexistence with other H4V3 services)
is `HOST_VALIDATION_REQUIRED` for the automation boundary. The acceptance
target is an **ephemeral Ubuntu-host clone of the PR**, never the persistent
deployment checkout and never the Hermes development checkout.

Set these operator-owned inputs before running the success block. Do not put
credentials in `REPO_URL` or `HERMES_HEALTH_URL`, and do not enable shell
tracing while running the block:

- `REPO_URL`: the repository's exact `origin` URL
- `PR_NUMBER`: the numeric GitHub pull request to validate
- `HERMES_CONTAINER`: the approved Hermes container name on the host
- `HERMES_HEALTH_URL`: the bounded URL that the Hermes container can use to
  reach this runtime (for a host-networked Hermes container this may be
  set with `HERMES_HEALTH_URL="http://127.0.0.1:${AVATAR_PORT:-8930}/healthz"`;
  use the configured route otherwise)
- optional `AVATAR_PORT`: the port used by the candidate, default `8930`

The block is copy-pasteable after those inputs are exported. It creates a
run-owned temporary clone, fetches `pull/<PR>/head`, asserts the exact SHA,
and only then builds or starts the service. The whole success path is a
non-interactive fail-closed subshell; a required command or gate failure
exits before the PASS marker. The temporary clone path is printed on both
success and failure: it must remain until the running acceptance service is
stopped through the same project-owned script, after which the operator may
remove that run-owned directory.

```bash
(
  set -euo pipefail

  : "${REPO_URL:?export REPO_URL with the repository origin URL}"
  : "${PR_NUMBER:?export PR_NUMBER with the numeric pull request number}"
  : "${HERMES_CONTAINER:?export HERMES_CONTAINER with the approved Hermes container name}"
  : "${HERMES_HEALTH_URL:?export HERMES_HEALTH_URL with the bounded Hermes route}"

  case "$PR_NUMBER" in
    ''|*[!0-9]*)
      printf 'PR_NUMBER must contain only decimal digits\n' >&2
      exit 2
      ;;
  esac

  for required in git docker curl node npm; do
    command -v "$required" >/dev/null 2>&1 || {
      printf 'required command is unavailable: %s\n' "$required" >&2
      exit 127
    }
  done
  docker compose version >/dev/null

  PORT="${AVATAR_PORT:-8930}"
  BASE="http://127.0.0.1:${PORT}"
  VALIDATION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/meowcore-avatar-pr.XXXXXX")"

  cleanup() {
    local rc=$?
    if [ "$rc" -eq 0 ]; then
      printf 'acceptance passed; retain clone until explicit service stop: %s\n' "$VALIDATION_DIR"
    else
      printf 'validation clone retained for diagnostics: %s\n' "$VALIDATION_DIR" >&2
    fi
  }
  trap cleanup EXIT

  git clone --no-checkout "$REPO_URL" "$VALIDATION_DIR"
  git -C "$VALIDATION_DIR" fetch --force origin "pull/${PR_NUMBER}/head"
  EXPECTED_HEAD="$(git -C "$VALIDATION_DIR" rev-parse FETCH_HEAD)"
  git -C "$VALIDATION_DIR" checkout --detach "$EXPECTED_HEAD"
  test "$(git -C "$VALIDATION_DIR" rev-parse HEAD)" = "$EXPECTED_HEAD"
  test -z "$(git -C "$VALIDATION_DIR" status --porcelain=v1)"
  cd "$VALIDATION_DIR"

  docker compose -f compose.yaml config >/dev/null
  ./scripts/avatar-runtime start
  ./scripts/avatar-runtime status

  assert_ready() {
    node -e '
      const fs = require("node:fs");
      let value;
      try {
        value = JSON.parse(fs.readFileSync(0, "utf8"));
      } catch (error) {
        console.error("invalid JSON response");
        process.exit(1);
      }
      if (value.status !== "ok" || value.ready !== true) {
        console.error("runtime is not ready");
        process.exit(1);
      }
    '
  }

  HEALTH="$(curl -fsS "$BASE/healthz")"
  printf '%s' "$HEALTH" | assert_ready
  STATE="$(curl -fsS "$BASE/api/state")"
  printf '%s' "$STATE" | node -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(0, "utf8"));
    if (value.model?.kind !== "placeholder") process.exit(1);
  '

  if docker exec "$HERMES_CONTAINER" sh -c 'command -v wget >/dev/null 2>&1'; then
    HERMES_HEALTH="$(docker exec "$HERMES_CONTAINER" wget -qO- "$HERMES_HEALTH_URL")"
  elif docker exec "$HERMES_CONTAINER" sh -c 'command -v curl >/dev/null 2>&1'; then
    HERMES_HEALTH="$(docker exec "$HERMES_CONTAINER" curl -fsS "$HERMES_HEALTH_URL")"
  else
    printf 'Hermes container has neither wget nor curl for bounded reachability\n' >&2
    exit 127
  fi
  printf '%s' "$HERMES_HEALTH" | assert_ready

  (
    cd runtime
    npm ci
    npx playwright install chromium
    AVATAR_SMOKE_BASE="$BASE" npm run smoke:browser
  )

  ./scripts/avatar-runtime stop
  ./scripts/avatar-runtime start
  ./scripts/avatar-runtime status
  HEALTH="$(curl -fsS "$BASE/healthz")"
  printf '%s' "$HEALTH" | assert_ready

  printf '✅ PR #%s HOST ACCEPTANCE PASS @ %s\n' "$PR_NUMBER" "$EXPECTED_HEAD"
)
```

If the success block stops before its marker, do not report host acceptance
as PASS. Use the retained path printed by the trap for bounded diagnostics:

```bash
# Set this to the exact path printed by the failed success block.
VALIDATION_DIR='/tmp/meowcore-avatar-pr.<run-id>'
(
  cd "$VALIDATION_DIR"
  ./scripts/avatar-runtime status || printf 'status diagnostics failed\n' >&2
  ./scripts/avatar-runtime logs || printf 'log diagnostics failed\n' >&2
  if ./scripts/avatar-runtime stop; then
    printf 'project runtime stopped; no unrelated service was targeted\n'
  else
    printf 'project runtime stop failed; retain the clone for operator recovery\n' >&2
    exit 1
  fi
)
rm -rf -- "$VALIDATION_DIR"
```

The cleanup command is limited to the exact `mktemp` directory created by
this run. It is not a general host cleanup command. If the stop step fails,
retain the directory and escalate rather than deleting it. The success block
must satisfy all of these conditions before its marker is trusted:

- the checked-out `HEAD` equals the fetched `pull/<PR>/head` SHA;
- Docker compose config/build/start and the project-owned service status pass;
- host `/healthz` is ready and `/api/state` reports the current model contract;
- the Hermes container reaches the service through the configured bounded URL;
- host-side Playwright smoke prints `BROWSER SMOKE PASS` for `/` and `/debug`;
- `stop` → `start` restores health and leaves the candidate running; and
- no unrelated service is restarted and no failure path reaches the PASS marker.

This is host acceptance evidence for the ephemeral PR clone only. It does not
prove that the PR is merged or that the persistent deployment is current.

## Post-merge persistent deployment (operator)

Run this procedure only after human review and GitHub evidence confirms that
the PR is merged into `main`. First stop and remove any acceptance service
from the ephemeral clone. Set `REPO_URL` to the exact remote URL and
`DEPLOYMENT_DIR` to the operator-managed persistent checkout; do not reuse the
ephemeral path.

The success block refuses dirty or non-`main` deployment checkouts. It fetches
`origin/main`, fast-forwards only, verifies `HEAD == origin/main`, then
rebuilds and restarts the repository-owned service:

```bash
(
  set -euo pipefail

  : "${REPO_URL:?export REPO_URL with the repository origin URL}"
  : "${DEPLOYMENT_DIR:?export DEPLOYMENT_DIR with the persistent checkout path}"
  for required in git docker curl; do
    command -v "$required" >/dev/null 2>&1 || {
      printf 'required command is unavailable: %s\n' "$required" >&2
      exit 127
    }
  done
  docker compose version >/dev/null

  test -d "$DEPLOYMENT_DIR/.git"
  test "$(git -C "$DEPLOYMENT_DIR" remote get-url origin)" = "$REPO_URL"
  test "$(git -C "$DEPLOYMENT_DIR" branch --show-current)" = "main"
  test -z "$(git -C "$DEPLOYMENT_DIR" status --porcelain=v1)"

  git -C "$DEPLOYMENT_DIR" fetch origin main
  git -C "$DEPLOYMENT_DIR" merge --ff-only origin/main
  test "$(git -C "$DEPLOYMENT_DIR" rev-parse HEAD)" = \
    "$(git -C "$DEPLOYMENT_DIR" rev-parse origin/main)"
  test -z "$(git -C "$DEPLOYMENT_DIR" status --porcelain=v1)"
  docker compose -f "$DEPLOYMENT_DIR/compose.yaml" config >/dev/null

  (
    cd "$DEPLOYMENT_DIR"
    ./scripts/avatar-runtime stop
    ./scripts/avatar-runtime start
    ./scripts/avatar-runtime status
  )
  curl -fsS "http://127.0.0.1:${AVATAR_PORT:-8930}/healthz" >/dev/null
  printf '✅ POST-MERGE DEPLOYMENT VERIFIED @ %s\n' \
    "$(git -C "$DEPLOYMENT_DIR" rev-parse HEAD)"
)
```

If deployment fails, do not print or infer a deployment PASS. Run
`./scripts/avatar-runtime status` and `./scripts/avatar-runtime logs` from
the persistent checkout, then stop only this project service if necessary.
The source rollback decision belongs to the human operator and must select a
known-good **merged `main` commit**; this contract does not authorize a
destructive reset, a PR ref, or a development checkout as a rollback target.
