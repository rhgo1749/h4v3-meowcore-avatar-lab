# Motion Language

Meowcore motion should feel authored, graphic and rhythmic rather than continuously floaty.

## Core timing vocabulary

```text
HOLD ── SNAP ── HOLD ── POP ── BOUNCE ── FREEZE
```

Smooth interpolation is allowed when it serves the pose, but constant secondary motion is not the default style.

## Initial motion set

### Idle
Small rhythmic bounce. Prefer stable silhouette and clear timing.

### Talk
Simple readable mouth motion. Avoid high-frequency noise that makes the face look mechanical.

### Beat hit
Short full-body accent: anticipation → squash → hit → recovery.

### Surprise
Fast face/pose change followed by body reaction.

### Confusion
Delayed head tilt, asymmetric facial treatment, deliberate hold.

### Miss / failure
Comedic freeze, deformation or stunned pose.

### Excitement
Higher-amplitude bounce and more frequent accents without destroying outline readability.

## Event-driven direction

The runtime should eventually accept structured events such as:

- `speech_start`
- `speech_end`
- `beat`
- `downbeat`
- `bpm`
- `energy`
- `emotion`
- `dj_state`

The event contract should remain bounded and semantic. Do not expose arbitrary code execution or generic file/command hooks as an animation interface.

## Debug semantic control contract

Before a Cubism model exists, the host-served runtime exposes a deterministic
debug/test surface for these semantic controls:

```text
angleX  angleY  bodyX  blink  mouth  smile  squash  bounce
```

The runtime owns their current values and publishes the defaults/ranges in
the `/api/state` schema; `/debug` is only a client of that state. `beat` is a
discrete event, observed through its count and timestamp, rather than another
continuous control. The API must reject unknown semantic ids and non-finite
values, and clamp numeric values to the schema range. This keeps the M3
renderer/model adapter boundary semantic instead of exposing Cubism-specific
parameter ids.

The direction and endpoint meanings are part of the same contract, not an
adapter convention:

| Control | Minimum | Default | Maximum |
|---|---|---|---|
| `angleX` | avatar turns toward its left | avatar faces forward | avatar turns toward its right |
| `angleY` | avatar looks down | avatar looks level | avatar looks up |
| `bodyX` | body moves toward avatar's left | body is centered | body moves toward avatar's right |
| `blink` | eyes open | eyes open | eyes fully closed |
| `mouth` | mouth closed | mouth closed | mouth fully open |
| `smile` | frown | neutral | smile |
| `squash` | vertical stretch | neutral | vertical squash |
| `bounce` | neutral | neutral | maximum debug bounce amplitude |

These meanings are returned by `GET /api/state` under each schema entry's
`meaning.min`, `meaning.default`, and `meaning.max` fields. In particular,
`blink=1` means fully closed, `mouth=1` means fully open, and the signed
controls use the explicitly listed left/right or stretch/squash directions.

## Live2D implication

Do not assume every reaction must be expressed as one continuously deforming parameter. Large cartoon reactions may be better represented by alternate art states, correction deformers, discrete expression assets, or deliberately stepped parameter transitions.
