# Security / Runtime Boundary

## Principle

The Avatar Runtime is a bounded host-served application, not a reason to grant Hermes generic host administration.

## Docker boundary

Do not expose an unauthenticated Docker daemon such as:

```text
tcp://0.0.0.0:2375
```

Do not add unrestricted `/var/run/docker.sock`, root, broad sudo, or arbitrary host filesystem access to Hermes merely for convenience.

If lifecycle automation is required, expose only project-scoped commands or management endpoints needed for this service.

## Checkout and deployment boundary

Hermes' development checkout/worktree is not an Ubuntu host deployment
checkout. Host acceptance of an unmerged PR is an operator action performed
from a disposable clone that fetches the exact `pull/<PR>/head` and asserts
the checked-out SHA. This does not require granting Hermes Docker socket,
root, broad sudo, or arbitrary host filesystem access.

The persistent deployment checkout is reserved for a human-merged `main`.
Before rebuild/restart it must be clean, on the `main` branch, and
fast-forwarded to the fetched `origin/main`. It must never be used to switch
to or validate a PR branch/worktree. The ephemeral validation checkout and
persistent deployment checkout therefore have separate lifecycle, rollback,
and evidence records.

## Network exposure

Default to the narrowest useful bind. A development runtime may begin loopback-only and later gain an explicit Tailscale/approved reverse-proxy route.

Remote browser access must not silently turn a debug/control API into an unauthenticated public service. Debug routes and mutation endpoints need a deliberate exposure policy before production use.

Initial port candidate: `8930`, configurable.

## API boundary

Allowed API concepts should be semantic and bounded, for example:

- state/health
- known model reload
- named expression/motion
- validated parameter ID + bounded numeric value
- structured beat/speech/DJ events

Do not create generic endpoints that execute arbitrary shell commands, arbitrary Docker operations, arbitrary local paths, or uploaded executable content.

## Secrets

Never commit or print:

- tokens
- passwords
- private keys
- service credentials
- unrelated `.env` contents

Use `.env.example` for non-secret configuration names and safe defaults only.

## Public repository / asset policy

This repository is public. Before committing binary/model/art/SDK material, explicitly determine whether it is suitable for public redistribution.

Do not vendor third-party sample models, proprietary artwork, Cubism SDK/source/binaries, fonts, or other licensed assets until the applicable redistribution terms have been verified for the exact material/version.

When uncertain, commit a manifest, placeholder, acquisition instructions, or local path convention instead of the asset itself.

## Validation claims

Repository checks prove repository behavior only. They do not prove:

- production host health,
- Cubism Editor rig correctness,
- final visual quality,
- H4V3-DJ production integration.

Record those as separate validation gates.

Host acceptance procedures must be fail-closed: verify required command
presence, assert exact source identity, and use `set -euo pipefail` (or an
equivalent checked chain) so a failed gate cannot reach the final PASS marker.
`command-not-found`, missing bounded client reachability, health failure, and
browser failure are failures or explicit `HOST_VALIDATION_REQUIRED` states;
they are not replaced with `free`, `skipped`, or a plausible-looking PASS.
