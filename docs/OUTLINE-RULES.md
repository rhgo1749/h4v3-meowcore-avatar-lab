# Outline / Deformation Rules

Bold outlines are a first-class technical requirement, not decoration.

## Goals

- Outer silhouette stays visually continuous.
- Line thickness remains stable enough to read as intentional.
- Overlapping parts do not expose accidental gaps.
- Face parts do not appear to slide independently during deformation.
- Head/body motion preserves the graphic drawing instead of creating rubber-like pseudo-3D distortion.

## High-risk seams

- jaw ↔ neck
- ears ↔ head
- hair/head shapes ↔ face
- arms ↔ torso
- mouth corners
- eyelids / eyebrows
- clothing boundaries
- any art-mesh edge crossing a heavy contour

## Rigging preference

Prefer a smaller attractive parameter range, discrete reaction poses, stepped swaps, or pose-specific correction over forcing a large continuous rotation that damages the drawing.

## Outline torture test

The runtime/debug tooling should eventually make it easy to sweep important parameters through their full allowed range and inspect the result.

Initial candidate sweep:

```text
Angle X
Angle Y
Body X/Y
Eye open
Mouth open/form
Smile/frown
Squash/stretch
Beat accent
```

Acceptance is not purely automated. Screenshots or parameter sweeps can expose defects, but final contour quality is human visual judgment.

## Common failure signals

- stretched/thinned contour
- texture seam becoming visible
- jaw detached from neck
- ear root gap
- mouth floating on face
- eye/eyebrow drift
- sudden contour kink between nearby parameter values
- shape becoming too 3D/realistic for the intended cartoon language
