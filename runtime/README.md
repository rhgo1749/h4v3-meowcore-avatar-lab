# Avatar Runtime (PR-001 bootstrap + M2 semantic controls + M3 visual dashboard)

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
current bounded M2 HTTP surface.

Rejected: bundling a Live2D SDK now (no licensed model asset yet, no
semantics to implement — would be a fake endpoint); Python/FastAPI (fine
HTTP-wise but the future renderer path is JS/WASM).

## Layout

```text
runtime/
  server/
    config.js    AVATAR_BIND / AVATAR_PORT / AVATAR_MODEL_ID / AVATAR_MODELS_DIR
    state.js     runtime state singleton (placeholder or configured model)
    model.js     M3 model registry: manifest validation, fail-closed states,
                 bounded model asset resolution
    app.js       HTTP handler (routing, static serving, traversal guard)
    server.js    entry point + graceful SIGTERM/SIGINT shutdown
  shared/
    mapping.js   semantic -> Cubism parameter mapping engine (server + browser)
  public/
    index.html   clean avatar output surface (/)
    debug.html   M3 visual dashboard (/debug)
    live2d/
      renderer.js  renderer registry: deterministic placeholder + cubism
                   adapter (official SDK for Web, fail-closed)
    vendor/      gitignored; licensed official Cubism SDK for Web lives here
                 (operator-installed)
  test/
    app.test.js      route/contract tests (node:test)
    state.test.js    semantic defaults/range/event tests
    config.test.js   env config tests
    compose.test.js  compose bind-contract tests (AVATAR_HOST_BIND etc.)
    public.test.js   public-surface XSS guard (no innerHTML)
    mapping.test.js  mapping clamp/direction regression tests
    model.test.js    model registry fail-closed tests
    fixtures.js      disposable model/SDK fixtures for tests
  smoke/
    browser-smoke.js headless chromium smoke (M2 round-trip + M3 dashboard
                     + fixture cubism renderer round-trip)
  Dockerfile     node:22-alpine, HEALTHCHECK, non-root (USER node)
```

Repository root additionally owns:

```text
compose.yaml             avatar-runtime service (AVATAR_HOST_BIND host bind,
                        AVATAR_MODELS_DIR_HOST model volume)
scripts/avatar-runtime   bounded lifecycle entry point
models/runtime/          operator-provided licensed model manifests (contract:
                        models/runtime/README.md; no binaries committed)
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
AVATAR_MODEL_ID    default (empty)    configured model directory under
                                     models/runtime; empty = placeholder renderer
AVATAR_MODELS_DIR  default <repo>/models/runtime
                                     model manifest root for bare `node` runs
AVATAR_MODELS_DIR_HOST
                   default ./models/runtime
                                     compose HOST directory mounted read-only at
                                     /srv/avatar-runtime/models/runtime (inject
                                     licensed model manifests/assets)
```

In the compose path (`compose.yaml`) the container-internal listen is fixed to
`0.0.0.0` — that is required so the published port mapping can reach it, and it
is not the exposure control. Exposure is governed by `AVATAR_HOST_BIND` on the
host side only; the default remains loopback-only per `docs/SECURITY.md`.

## HTTP surface (M2 semantic controls)

```text
GET /healthz   machine-readable readiness JSON (status/ready/version/model)
GET /api/state runtime state (model, semantic controls, mapped params, events, counters)
POST /api/control {"id":"<semantic id>","value":<number>} (bounded/clamped)
POST /api/reset  empty body; reset all semantic controls to defaults
POST /api/beat   empty body; record one discrete beat event
GET /          clean avatar output surface
GET /debug     M3 visual dashboard (viewport + controls + inspector + presets)
```

### M3 model contract (read-only)

```text
GET /api/model             model descriptor + manifest + mapping + SDK status
GET /models/<id>/<file>    bounded static serving inside the configured model
                           directory (traversal-guarded, modelId allowlist)
GET /js/mapping.js         shared semantic -> Cubism mapping module (the exact
                           code the server tests use, served to the browser)
```

There is no mutation endpoint for raw Cubism parameters. Mapped parameter
values appear read-only in `/api/state` (`mapped`) and in the dashboard
inspector; the public mutation API accepts only the eight semantic ids.

The server owns the semantic state. The public ids are deliberately not
Cubism/ArtMesh ids:

| ID | Default | Min | Max | Unit | Meaning at min / default / max |
|---|---:|---:|---:|---|---|
| `angleX` | 0 | -30 | 30 | degrees | avatar turns toward its left / faces forward / avatar turns toward its right |
| `angleY` | 0 | -20 | 20 | degrees | looks down / looks level / looks up |
| `bodyX` | 0 | -1 | 1 | normalized | body moves toward avatar's left / body is centered / body moves toward avatar's right |
| `blink` | 0 | 0 | 1 | normalized | eyes open / eyes open / eyes fully closed |
| `mouth` | 0 | 0 | 1 | normalized | mouth closed / mouth closed / mouth fully open |
| `smile` | 0 | -1 | 1 | normalized | frown / neutral / smile |
| `squash` | 0 | -1 | 1 | normalized | vertical stretch / neutral / vertical squash |
| `bounce` | 0 | 0 | 1 | normalized | neutral / neutral / maximum debug bounce amplitude |

The meaning column is also published as `semantic.schema.<id>.meaning` in
`GET /api/state` with explicit `min`, `default`, and `max` fields. A future M3
adapter must consume those semantic meanings without inferring direction from
Cubism parameter conventions; Cubism-specific ids remain internal to that
adapter.

Numeric values outside these ranges are clamped. Unknown ids, non-finite
values, malformed JSON, extra request fields, and oversized bodies are
rejected with a bounded `400` response. `beat` is discrete: it increments
`semantic.events.beatCount` and records `lastBeatAt`; it does not add a
persistent continuous control.

Deliberately **not** implemented yet: reload/expression/motion/parameter
endpoints and `/ws/events`. They will appear only together with real model
loader/controller semantics (no fake endpoints).

## M3 visual dashboard (/debug)

`/debug` renders three layers on one screen:

1. **Live model viewport** — canvas renderer selected by the model registry:
   - `cubism` renderer: loads the licensed official Cubism SDK for Web from
     `public/vendor/live2d/` (operator-installed, gitignored) and the model
     from `models/runtime/<id>/`, applies the manifest mapping through the
     shared module, and drives `setParameterValueById` per frame. Any load
     step that fails is reported fail-closed with a specific message.
   - `placeholder` renderer: deterministic Canvas 2D avatar derived only from
     the semantic controls (no randomness, no SDK). Used whenever no licensed
     model/SDK is configured; it is a placeholder visualization, not a
     Live2D renderer.
2. **Semantic control panel** — the M2 contract unchanged: 8 sliders +
   numeric values, reset / beat / refresh, plus preset/torture buttons
   (Neutral, Left, Right, Up, Down, Blink closed, Mouth open, Smile, Frown,
   Squash, Stretch, Bounce max) that go through the same bounded API.
3. **Runtime inspector** — model load/error state, current semantic state,
   mapped Cubism parameters (read-only table), beat/event counter and an
   event log. Raw Cubism parameter ids never enter the mutation API.

The renderer never fakes a model: without a manifest/SDK it shows the
placeholder and explains why. Real deformation/outline quality is a human
gate (see `docs/OUTLINE-RULES.md`), not a repository assertion.

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

The smoke covers both dashboard modes without licensed assets:
scenario 1 (placeholder dashboard: viewport renderer, presets, control
round-trip, console errors 0) and scenario 2 (fixture cubism model + stub
SDK: renderer activation, shared-mapping -> setParameterValueById
round-trip, read-only mapped table). Scenario 2 writes gitignored stub SDK
files under `public/vendor/live2d/` and removes them afterwards.

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
- static serving resolves inside `public/` (path traversal rejected);
  model assets resolve inside the configured model directory only
- container runs as non-root (`USER node`), read-only rootfs,
  `no-new-privileges`, no host sockets/volumes (licensed models are a
  read-only volume mount of the operator's own directory)
- the API has no arbitrary command/path/Docker escape hatches; raw Cubism
  parameter ids are read-only (`/api/state.mapped`, `/api/model`,
  dashboard inspector), never accepted by a mutation endpoint
- no secrets, no third-party assets vendored (placeholder only; licensed
  SDK/model files are operator-installed under gitignored paths)

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
