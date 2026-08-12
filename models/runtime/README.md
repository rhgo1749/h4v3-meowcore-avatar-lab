# Runtime model manifests (M3 contract)

`models/runtime/<modelId>/` is the operator-provided, license-verified model
root for the Avatar Runtime. The repository ships **no** model binaries and
**no** Cubism SDK/Core files; this directory documents the manifest contract
the runtime validates against.

A model becomes active only when `AVATAR_MODEL_ID=<modelId>` is set. Without
it the runtime serves the deterministic placeholder renderer.

## Layout

```text
models/runtime/
  <modelId>/
    manifest.json          # validated by the runtime (fail-closed)
    <model3 file>          # e.g. meowcore-01.model3.json (exported model settings)
    <moc3 + textures + other export files>
```

The runtime serves only files inside the configured model directory
(`GET /models/<modelId>/...`), with a path-traversal guard and a strict
`modelId` pattern (`[A-Za-z0-9][A-Za-z0-9_-]*`).

## manifest.json schema

```json
{
  "modelId": "meowcore-01",
  "displayName": "Meowcore Test Model 01",
  "kind": "cubism",
  "sdk": {
    "core": "live2dcubismcore.min.js",
    "framework": "live2d.min.js"
  },
  "model3": "meowcore-01.model3.json",
  "mapping": {
    "angleX": [{ "parameter": "ParamAngleX", "min": -30, "max": 30, "scale": 1, "bias": 0 }],
    "angleY": [{ "parameter": "ParamAngleY", "min": -20, "max": 20, "scale": 1, "bias": 0 }],
    "bodyX": [{ "parameter": "ParamBodyAngleX", "min": -10, "max": 10, "scale": 1, "bias": 0 }],
    "blink": [
      { "parameter": "ParamEyeLOpen", "min": 0, "max": 1, "scale": -1, "bias": 1 },
      { "parameter": "ParamEyeROpen", "min": 0, "max": 1, "scale": -1, "bias": 1 }
    ],
    "mouth": [{ "parameter": "ParamMouthOpenY", "min": 0, "max": 1, "scale": 1, "bias": 0 }],
    "smile": [{ "parameter": "ParamMouthForm", "min": -1, "max": 1, "scale": 1, "bias": 0 }],
    "squash": [{ "parameter": "ParamBodyScaleY", "min": -1, "max": 1, "scale": 1, "bias": 0 }],
    "bounce": [{ "parameter": "ParamY", "min": 0, "max": 1, "scale": 1, "bias": 0 }]
  }
}
```

### Field rules

- `modelId` must equal the directory name (enforced).
- `kind` must be `"cubism"` (a future non-Live2D renderer would add its own
  kind; placeholder is never a manifest kind).
- `model3` must be a plain file name inside the directory (no `/`, no `..`).
- `sdk.core` / `sdk.framework` are file names under
  `runtime/public/vendor/live2d/` (defaults shown above). Those files are the
  licensed official Cubism SDK for Web and are never committed; the renderer
  reports a fail-closed "SDK missing" state until an operator installs them.
- `mapping` keys must be **public semantic ids only** (`angleX`, `angleY`,
  `bodyX`, `blink`, `mouth`, `smile`, `squash`, `bounce`). Unknown ids are
  rejected with `mapping_invalid`; they are never silently accepted.

### Mapping target semantics

Each target maps one semantic value to one Cubism parameter:

```text
mapped = clamp(bias + scale * semanticValue, min, max)
```

- `min`/`max` are the clamp bounds (should match the parameter ranges in the
  exported model3.json). `min < max` is enforced.
- `scale`/`bias` must be finite numbers. A negative `scale` inverts the
  direction — e.g. `blink` (0 = open, 1 = closed) maps to `ParamEyeLOpen`
  with `scale: -1, bias: 1` so open eyes = 1 and closed eyes = 0.
- The signed direction contract is the M2 semantic meaning
  (`semantic.schema.<id>.meaning` in `GET /api/state`):
  angleX left↔right, angleY down↔up, bodyX left↔right, blink open→closed,
  mouth closed→open, smile frown→smile, squash stretch→squash,
  bounce neutral→max amplitude.
- Multiple targets per semantic id are allowed for mirrored parameters
  (e.g. both eyes). If the same parameter appears in several targets, the
  later target wins (documented in `runtime/shared/mapping.js`).

## Fail-closed states (exposed in `/api/model` and `/api/state`)

| Condition | `model.error.code` |
|---|---|
| invalid `AVATAR_MODEL_ID` characters | `model_invalid_id` |
| `manifest.json` missing | `manifest_not_found` |
| manifest is not valid JSON | `manifest_invalid_json` |
| schema violation (modelId mismatch, kind, unsafe model3) | `manifest_invalid` |
| mapping violates the semantic contract | `mapping_invalid` |
| declared model3 file missing | `model3_not_found` |

`model.ready` is true only when the manifest validates and the model3 file
exists. `sdk.available` additionally requires the licensed SDK files under
`runtime/public/vendor/live2d/`; the browser renderer activates the cubism
adapter only when both are true, otherwise it renders the deterministic
placeholder and explains why.

## License gate (unchanged project rule)

Third-party sample models, proprietary artwork, and Cubism SDK/Core/source
files must not be committed until their redistribution terms are verified
for the exact version. Keep private staging under `models/private/`
(gitignored) and install licensed runtime files locally:

```bash
# example (operator-owned paths)
mkdir -p runtime/public/vendor/live2d
cp <licensed-sdk>/Core/live2dcubismcore.min.js runtime/public/vendor/live2d/
cp <licensed-sdk>/Framework/.../live2d.min.js      runtime/public/vendor/live2d/
cp -r <licensed-model-export> models/runtime/<modelId>/
AVATAR_MODEL_ID=<modelId> npm start   # from runtime/
```

Visual deformation/outline quality is a separate human gate
(`docs/OUTLINE-RULES.md`, `docs/LIVE2D-RIG-SPEC.md`); a manifest that loads
is not a quality acceptance.
