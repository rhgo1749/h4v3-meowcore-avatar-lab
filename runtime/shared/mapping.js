'use strict';

/**
 * Shared semantic -> Cubism parameter mapping engine (M3).
 *
 * Single source of truth used by BOTH sides:
 *   - server: validates model manifests and computes read-only mapped
 *     parameters for /api/state (runtime/tests);
 *   - browser: applied by the renderer adapter in /debug (served as
 *     /js/mapping.js, exposed as window.MeowcoreMapping).
 *
 * The public semantic contract (CONTROL_SCHEMA in server/state.js) is the
 * input. Cubism parameter ids exist only inside a model manifest mapping;
 * they are never accepted by the mutation API.
 *
 * Direction contract (M2 meaning, preserved verbatim):
 *   angleX  min(left) <-> max(right)
 *   angleY  min(down) <-> max(up)
 *   bodyX   min(left) <-> max(right)
 *   blink   min(open) <-> max(closed)
 *   mouth   min(closed) <-> max(open)
 *   smile   min(frown) <-> max(smile)
 *   squash  min(stretch) <-> max(squash)
 *   bounce  min(neutral) <-> max(max debug amplitude)
 *
 * A target entry maps one semantic value to one Cubism parameter:
 *   mapped = clamp(bias + scale * semanticValue, min, max)
 * A negative scale inverts the direction (e.g. blink -> ParamEyeLOpen).
 */

/**
 * UMD-lite wrapper: CommonJS on the server, window.MeowcoreMapping in the
 * browser (served via /js/mapping.js).
 * @param {any} root
 * @param {() => any} factory
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // Browser path: served as /js/mapping.js; Node never takes this branch.
    /** @type {any} */ (root).MeowcoreMapping = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Fail-closed manifest mapping validation.
   *
   * Rejects unknown semantic ids (never silently accepted), non-object
   * targets, non-finite scale/bias, missing parameter ids, and invalid or
   * degenerate [min, max] bounds. Returns { ok, errors }.
   */
  function validateMapping(mapping, controlSchema) {
    const errors = [];
    if (mapping === null || typeof mapping !== 'object' || Array.isArray(mapping)) {
      return { ok: false, errors: ['mapping must be an object'] };
    }
    const knownIds = Object.keys(controlSchema);
    for (const [semanticId, entries] of Object.entries(mapping)) {
      if (!knownIds.includes(semanticId)) {
        errors.push('unknown semantic control id: ' + semanticId);
        continue;
      }
      if (!Array.isArray(entries) || entries.length === 0) {
        errors.push(
          'mapping.' + semanticId + ' must be a non-empty array of parameter targets'
        );
        continue;
      }
      entries.forEach((entry, index) => {
        const at = 'mapping.' + semanticId + '[' + index + ']';
        if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
          errors.push(at + ' must be an object');
          return;
        }
        if (typeof entry.parameter !== 'string' || entry.parameter.length === 0) {
          errors.push(at + '.parameter must be a non-empty string');
        }
        if (!isFiniteNumber(entry.min) || !isFiniteNumber(entry.max)) {
          errors.push(at + '.min and .max must be finite numbers');
        } else if (entry.min >= entry.max) {
          errors.push(at + ': min must be strictly less than max');
        }
        if (!isFiniteNumber(entry.scale)) {
          errors.push(at + '.scale must be a finite number');
        }
        if (!isFiniteNumber(entry.bias)) {
          errors.push(at + '.bias must be a finite number');
        }
      });
    }
    return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
  }

  /**
   * Apply a validated mapping to the current semantic controls.
   *
   * Returns { [cubismParameterId]: number }. Every result is clamped to the
   * target's declared [min, max]. Controls that are missing or non-finite
   * are skipped (never invented). When the same parameter id appears in
   * several targets, later entries win; manifests should normally keep one
   * parameter per semantic id or use distinct ids (e.g. both eyes).
   */
  function applyMapping(mapping, controls) {
    const applied = {};
    for (const [semanticId, entries] of Object.entries(mapping)) {
      const value = controls[semanticId];
      if (!isFiniteNumber(value)) {
        continue;
      }
      for (const entry of entries) {
        applied[entry.parameter] = clamp(
          entry.bias + entry.scale * value,
          entry.min,
          entry.max
        );
      }
    }
    return applied;
  }

  /**
   * Deterministic flat listing of mapping targets, useful for inspectors
   * and regression tests (semantic -> parameter direction/range).
   */
  function parameterEntries(mapping) {
    const entries = [];
    for (const [semanticId, targets] of Object.entries(mapping)) {
      for (const target of targets) {
        entries.push({
          semantic: semanticId,
          parameter: target.parameter,
          min: target.min,
          max: target.max,
          scale: target.scale,
          bias: target.bias,
        });
      }
    }
    return entries;
  }

  return { applyMapping, clamp, isFiniteNumber, parameterEntries, validateMapping };
});
