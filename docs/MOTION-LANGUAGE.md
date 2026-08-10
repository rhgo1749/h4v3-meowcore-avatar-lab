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

## Live2D implication

Do not assume every reaction must be expressed as one continuously deforming parameter. Large cartoon reactions may be better represented by alternate art states, correction deformers, discrete expression assets, or deliberately stepped parameter transitions.
