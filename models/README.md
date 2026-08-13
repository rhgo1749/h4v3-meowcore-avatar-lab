# Models

This directory is reserved for Meowcore Live2D runtime model artifacts and manifests.

## Rules

- Do not treat third-party sample models as Meowcore assets.
- Confirm public-redistribution suitability before committing any model/art/SDK material.
- Keep private/local-only staging under `models/private/` (gitignored).
- Distinguish human authoring files from runtime exports in naming/documentation.
- A model checked into Git is not automatically production-approved; visual/Cubism acceptance remains separate.

PR-001 does not require a real Meowcore Live2D model. A deterministic placeholder/test surface is preferred until the first approved rig/export exists.

## Runtime manifests (M3)

`models/runtime/` is the operator-provided, license-verified model root
consumed by the Avatar Runtime. It ships only the manifest contract
(`models/runtime/README.md`), never binaries. A model activates through
`AVATAR_MODEL_ID=<modelId>`; without it the runtime serves the deterministic
placeholder renderer. The runtime validates each manifest fail-closed
(unknown semantic ids, unsafe paths, missing model3, missing licensed SDK
files all surface as explicit error states in `/api/model`).
