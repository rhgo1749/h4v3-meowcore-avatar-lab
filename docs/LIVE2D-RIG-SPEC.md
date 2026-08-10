# Live2D Rig Specification — Draft

This document defines the first rigging constraints for Meowcore. It is intentionally conservative until an approved character design exists.

## Primary goal

Preserve the cartoon drawing under motion.

A technically smooth rig that weakens the outline, silhouette or expression readability is a failed rig for this project.

## Initial parameter families

Candidate families only; exact IDs are not frozen yet.

- head X/Y and limited Z
- body X/Y
- eye open / eye direction
- brow / expression state
- mouth open / mouth form
- squash / stretch
- beat accent
- pose/expression correction parameters

## Range policy

Start with narrow visually safe ranges. Expand only after outline/deformation review.

Large reactions may use discrete expression/pose states rather than forcing all art through one continuous wide-angle deformation.

## Required visual checks

- front neutral
- left/right head range endpoints
- up/down endpoints
- blink extremes
- mouth extremes
- smile/frown extremes
- body lean extremes
- squash/stretch extremes
- combination cases likely during speech + beat motion

Use `docs/OUTLINE-RULES.md` as the acceptance reference.

## Physics

Secondary physics are optional. Hair/accessory/body physics should be added only when they support the graphic cartoon style and should not make the avatar constantly float or wobble by default.

## Export/runtime contract

Runtime-export naming, file layout and parameter IDs must become deterministic once the first real model exists. Changes to those contracts should be documented and validated in the runtime rather than maintained only in Cubism Editor knowledge.
