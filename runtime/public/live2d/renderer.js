'use strict';

/**
 * Avatar renderer registry and adapters (M3).
 *
 * The dashboard (/debug) selects a renderer by model configuration:
 *
 *   cubism       real Live2D model rendered through the official Cubism SDK
 *                for Web (licensed files are NOT committed; the operator
 *                places them under public/vendor/live2d/ and a licensed
 *                model manifest under models/runtime/<id>/).
 *   placeholder  deterministic Canvas 2D avatar that visualizes the
 *                semantic controls without any SDK/model. This is the
 *                existing placeholder contract, now visible; it is NOT a
 *                Live2D renderer implementation.
 *
 * Every renderer exposes the same minimal surface:
 *   setControls(controls)  latest semantic controls (numbers)
 *   resize()               respond to canvas/container size changes
 *   status()               { kind, state, message, appliedParameters }
 *   dispose()              stop the animation loop
 *
 * The semantic -> Cubism mapping is applied through the shared module
 * (window.MeowcoreMapping, served from /js/mapping.js) so server and
 * browser always agree on clamps and directions.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // Browser path: served as /live2d/renderer.js; Node never takes this.
    /** @type {any} */ (root).AvatarRenderers = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Browser global root. The outer wrapper's `root` parameter is NOT in
  // scope here, so resolve the global explicitly (self in browsers,
  // globalThis in Node for tests).
  const root = typeof self !== 'undefined'
    ? self
    : typeof window !== 'undefined'
      ? window
      : globalThis;

  const factories = Object.create(null);

  function register(kind, factory) {
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new Error('renderer kind must be a non-empty string');
    }
    if (typeof factory !== 'function') {
      throw new Error('renderer factory must be a function');
    }
    factories[kind] = factory;
  }

  function kinds() {
    return Object.keys(factories).sort();
  }

  function create(kind, options) {
    const factory = factories[kind];
    if (!factory) {
      throw new Error('unknown renderer kind: ' + kind);
    }
    return factory(options);
  }

  // ---------------------------------------------------------------------
  // Placeholder renderer: deterministic Canvas 2D semantic visualization.
  // ---------------------------------------------------------------------

  const BACKING_SIZE = 640;

  function placeholderFactory({ canvas, log }) {
    const context = canvas.getContext('2d');
    let controls = null;
    let frameId = 0;

    function ensureBacking() {
      if (canvas.width !== BACKING_SIZE || canvas.height !== BACKING_SIZE) {
        canvas.width = BACKING_SIZE;
        canvas.height = BACKING_SIZE;
      }
    }

    function value(key, fallback) {
      return controls && typeof controls[key] === 'number'
        ? controls[key]
        : fallback;
    }

    function draw() {
      if (!context) {
        return;
      }
      ensureBacking();
      const ctx = context;
      ctx.clearRect(0, 0, BACKING_SIZE, BACKING_SIZE);

      const INK = '#1a1a1a';
      const CREAM = '#fdfdf8';
      const ACCENT = '#e8462a';
      const MUTED = '#8a8a80';

      const bounce = value('bounce', 0); // 0..1 -> vertical bob
      const squash = value('squash', 0); // -1 stretch .. 1 squash
      const angleX = value('angleX', 0); // -30..30 deg
      const angleY = value('angleY', 0); // -20..20 deg
      const bodyX = value('bodyX', 0); // -1..1
      const blink = value('blink', 0); // 0 open .. 1 closed
      const mouth = value('mouth', 0); // 0 closed .. 1 open
      const smile = value('smile', 0); // -1 frown .. 1 smile

      const bob = -bounce * 70;
      const scaleY = 1 + squash * 0.16;
      const scaleX = 1 - squash * 0.1;
      const bodyShift = bodyX * 46;
      const headX = 320 + bodyShift * 0.35;
      const headY = 330 + bob + angleY * 3;
      const headRotate = (angleX * Math.PI) / 180;

      ctx.save();
      // Squash/stretch pivots around the stage floor.
      ctx.translate(320, 640);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-320, -640);

      // --- body ---
      ctx.save();
      ctx.translate(bodyShift, 0);
      ctx.fillStyle = CREAM;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(320 - 74, 430, 148, 210, 36);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // --- head group (turn + tilt) ---
      ctx.save();
      ctx.translate(headX, headY);
      ctx.rotate(headRotate);

      // ears
      ctx.fillStyle = CREAM;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-86, -40);
      ctx.lineTo(-118, -128);
      ctx.lineTo(-30, -92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(86, -40);
      ctx.lineTo(118, -128);
      ctx.lineTo(30, -92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // head
      ctx.fillStyle = CREAM;
      ctx.beginPath();
      ctx.arc(0, 0, 112, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // eyes (blink scales eye height; smile raises brow line)
      const eyeOpen = 1 - blink;
      for (const side of [-1, 1]) {
        const eyeX = side * 44;
        const eyeY = -18;
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, 16, 20 * eyeOpen, 0, 0, Math.PI * 2);
        ctx.fill();
        // brow: frown -> downward arch, smile -> upward arch
        ctx.strokeStyle = INK;
        ctx.lineWidth = 7;
        ctx.beginPath();
        if (smile >= 0) {
          ctx.moveTo(eyeX - 24, eyeY - 52 - smile * 16);
          ctx.quadraticCurveTo(eyeX, eyeY - 66 - smile * 14, eyeX + 24, eyeY - 52 - smile * 16);
        } else {
          ctx.moveTo(eyeX - 24, eyeY - 52 + smile * 16);
          ctx.quadraticCurveTo(eyeX, eyeY - 42 + smile * 12, eyeX + 24, eyeY - 52 + smile * 16);
        }
        ctx.stroke();
      }

      // nose
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-9, 22);
      ctx.lineTo(9, 22);
      ctx.closePath();
      ctx.fill();

      // mouth: closed smile curve + open mouth ellipse
      if (mouth > 0.05) {
        ctx.fillStyle = '#7a1f14';
        ctx.beginPath();
        ctx.ellipse(0, 46, 16 + mouth * 16, 4 + mouth * 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.stroke();
      } else {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-18, 40 + smile * 8);
        ctx.quadraticCurveTo(0, 52 + smile * 14, 18, 40 + smile * 8);
        ctx.stroke();
      }

      // whiskers (stable static detail)
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = 3;
      for (const [wx, wy, dx] of [[-96, 2, -1], [-100, 26, -1], [96, 2, 1], [100, 26, 1]]) {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + dx * 34, wy + 4);
        ctx.stroke();
      }

      ctx.restore();

      // placeholder caption (drawn last, not part of the avatar)
      ctx.fillStyle = MUTED;
      ctx.font = '20px ui-monospace, monospace';
      ctx.fillText('placeholder renderer', 24, 624);
      ctx.restore();
    }

    function loop() {
      draw();
      frameId = requestAnimationFrame(loop);
    }

    function resize() {
      draw();
    }

    function setControls(next) {
      controls = next;
    }

    function status() {
      return {
        kind: 'placeholder',
        state: 'ready',
        message: 'placeholder renderer: no licensed Cubism model configured',
        appliedParameters: {},
      };
    }

    function dispose() {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }

    ensureBacking();
    loop();
    return { kind: 'placeholder', setControls, resize, status, dispose };
  }

  register('placeholder', placeholderFactory);

  // ---------------------------------------------------------------------
  // Cubism renderer: official Cubism SDK for Web adapter.
  // ---------------------------------------------------------------------

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(undefined);
      script.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  function cubismFactory({ canvas, model, manifest, mapping, sdk, log }) {
    let frameId = 0;
    let controls = null;
    let state = 'loading';
    let message = 'initializing cubism renderer…';
    let appliedParameters = {};
    /** @type {any} */
    let cubismModel = null;
    /** @type {any} */
    let gl = null;
    let failed = false;

    function fail(step, error) {
      if (failed) {
        return;
      }
      failed = true;
      state = 'error';
      message = 'cubism renderer error at ' + step + ': ' + error.message;
      if (log) {
        log('model error: ' + message);
      }
    }

    async function initialize() {
      if (!mapping) {
        fail('manifest', new Error('no semantic mapping in model manifest'));
        return;
      }
      const coreUrl = sdk.basePath + sdk.files.core;
      const frameworkUrl = sdk.basePath + sdk.files.framework;
      try {
        await loadScript(coreUrl);
        await loadScript(frameworkUrl);
      } catch (error) {
        fail('sdk-load', error);
        return;
      }
      const framework = root.Live2DCubismFramework;
      if (
        !framework ||
        !framework.CubismFramework ||
        !framework.CubismModelSettingsJson ||
        !framework.CubismModel
      ) {
        fail(
          'sdk-surface',
          new Error(
            'Live2DCubismFramework globals missing; expected official ' +
              'Cubism SDK for Web files at ' + sdk.basePath
          )
        );
        return;
      }

      // WebGL is required by the official SDK renderer.
      gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      if (!gl) {
        fail('webgl', new Error('WebGL context is unavailable on this canvas'));
        return;
      }

      try {
        framework.CubismFramework.initialize();
        const model3Url = '/models/' + model.id + '/' + manifest.model3;
        const settings = new framework.CubismModelSettingsJson(model3Url);
        cubismModel = new framework.CubismModel(settings);
        await cubismModel.loadModel();
        const renderer = cubismModel.createRenderer
          ? cubismModel.createRenderer()
          : null;
        if (renderer && renderer.setMvpMatrix && framework.CubismMatrix44) {
          const matrix = new framework.CubismMatrix44();
          matrix.scale(1, canvas.clientHeight / canvas.clientWidth, 1);
          renderer.setMvpMatrix(matrix);
        }
        state = 'ready';
        message = 'cubism model ready: ' + model.id;
        if (log) {
          log('model ready: ' + model.id);
        }
        frameId = requestAnimationFrame(frame);
      } catch (error) {
        fail('model-load', error);
      }
    }

    function frame() {
      frameId = requestAnimationFrame(frame);
      if (failed || !cubismModel) {
        return;
      }
      try {
        if (!root.MeowcoreMapping) {
          throw new Error('shared mapping module (MeowcoreMapping) is missing');
        }
        appliedParameters = root.MeowcoreMapping.applyMapping(
          mapping,
          controls || {}
        );
        for (const [parameter, parameterValue] of Object.entries(appliedParameters)) {
          if (typeof cubismModel.setParameterValueById === 'function') {
            cubismModel.setParameterValueById(parameter, parameterValue, 1.0);
          }
        }
        cubismModel.update();
        if (typeof cubismModel.draw === 'function') {
          cubismModel.draw(gl);
        }
      } catch (error) {
        fail('frame', error);
      }
    }

    function setControls(next) {
      controls = next;
    }

    function resize() {
      if (gl && cubismModel) {
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
    }

    function status() {
      return {
        kind: 'cubism',
        state,
        message,
        modelId: model.id,
        appliedParameters: { ...appliedParameters },
      };
    }

    function dispose() {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }

    initialize();
    return { kind: 'cubism', setControls, resize, status, dispose };
  }

  register('cubism', cubismFactory);

  return { create, kinds, register };
});
