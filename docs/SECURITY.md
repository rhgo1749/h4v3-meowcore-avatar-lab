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
