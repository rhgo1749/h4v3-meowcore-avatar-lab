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
      const { scaleX, scaleY } = placeholderScale(squash);
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

  function placeholderScale(squash) {
    const value = typeof squash === 'number' && Number.isFinite(squash) ? squash : 0;
    return {
      // M2 contract: -1 is vertical stretch and +1 is vertical squash.
      scaleX: 1 - value * 0.1,
      scaleY: 1 - value * 0.16,
    };
  }

  // ---------------------------------------------------------------------
  // Cubism renderer: official Cubism SDK for Web adapter.
  // ---------------------------------------------------------------------

  function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(undefined);
      script.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  async function fetchArrayBuffer(url, description) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        'failed to load ' + description + ' (' + response.status + '): ' + url
      );
    }
    return response.arrayBuffer();
  }

  /**
   * Verify the complete official WebGL shader asset contract before asking
   * Cubism to start its asynchronous shader loader. Cubism's loader catches
   * individual fetch errors and substitutes an empty source, so relying on
   * `_isShaderLoaded` alone would otherwise allow a false-ready renderer.
   */
  async function verifyShaderAssets(shaderPath, shaderFiles) {
    if (
      typeof shaderPath !== 'string' ||
      !shaderPath.endsWith('/') ||
      !Array.isArray(shaderFiles) ||
      shaderFiles.length === 0
    ) {
      throw new Error('official Cubism shader asset manifest is missing');
    }
    const uniqueFiles = new Set();
    for (const file of shaderFiles) {
      if (
        typeof file !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:vert|frag)$/.test(file) ||
        uniqueFiles.has(file)
      ) {
        throw new Error('official Cubism shader asset name is invalid');
      }
      uniqueFiles.add(file);
    }
    await Promise.all([...uniqueFiles].map(async (file) => {
      const response = await fetch(shaderPath + encodeURIComponent(file));
      if (!response.ok) {
        throw new Error(
          'failed to load Cubism shader (' + response.status + '): ' + file
        );
      }
      if ((await response.text()).trim().length === 0) {
        throw new Error('Cubism shader is empty: ' + file);
      }
    }));
  }

  function assetUrl(modelId, relativePath) {
    const encodedId = encodeURIComponent(modelId);
    const encodedPath = relativePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return '/models/' + encodedId + '/' + encodedPath;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('failed to load texture: ' + url));
      image.src = url;
    });
  }

  /**
   * Load and bind model textures using the official renderer boundary.
   * CubismModelSettingJson returns the file names; CubismRenderer_WebGL owns
   * the texture indices through bindTexture().
   */
  async function loadTextures(settings, modelId, renderer, gl) {
    const textureCount = settings.getTextureCount();
    for (let index = 0; index < textureCount; index += 1) {
      const fileName = settings.getTextureFileName(index);
      if (!fileName) {
        continue;
      }
      const image = await loadImage(assetUrl(modelId, fileName));
      const texture = gl.createTexture();
      if (!texture) {
        throw new Error('WebGL texture allocation failed for ' + fileName);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        image
      );
      renderer.bindTexture(index, texture);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  function requireOfficialSurface(framework) {
    const required = [
      'CubismFramework',
      'CubismModelSettingJson',
      'CubismUserModel',
      'CubismRenderer_WebGL',
      'CubismShaderManager_WebGL',
      'CubismMatrix44',
    ];
    const missing = required.filter((name) => typeof framework?.[name] !== 'function');
    if (missing.length > 0) {
      throw new Error(
        'official Cubism SDK surface missing: ' + missing.join(', ')
      );
    }
    const cubismFramework = framework.CubismFramework;
    for (const method of ['startUp', 'initialize', 'getIdManager']) {
      if (typeof cubismFramework[method] !== 'function') {
        throw new Error('official CubismFramework.' + method + '() is missing');
      }
    }
    if (typeof framework.CubismShaderManager_WebGL.getInstance !== 'function') {
      throw new Error('official CubismShaderManager_WebGL.getInstance() is missing');
    }
  }

  /**
   * CubismRenderer_WebGL.loadShaders() starts an asynchronous internal fetch
   * but returns void. Observe the official shader manager state instead of
   * treating that call as readiness. The official framework leaves loading
   * false and loaded false when one of its shader fetches fails.
   */
  function waitForShaderReady(framework, gl, timeoutMs = 10000) {
    const startedAt = Date.now();
    let observedLoading = false;
    return new Promise((resolve, reject) => {
      function check() {
        let shader;
        try {
          const manager = framework.CubismShaderManager_WebGL.getInstance();
          shader = manager && manager.getShader(gl);
          if (!shader) {
            throw new Error('official Cubism shader manager has no WebGL shader state');
          }
          if (shader._isShaderLoaded === true) {
            resolve(undefined);
            return;
          }
          if (shader._isShaderLoading === true) {
            observedLoading = true;
          } else if (observedLoading) {
            throw new Error('official Cubism shader loading failed');
          }
        } catch (error) {
          reject(error);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('official Cubism shader loading timed out'));
          return;
        }
        setTimeout(check, 16);
      }
      check();
    });
  }

  /**
   * Minimal LAppModel-shaped adapter.
   *
   * The official sample does not construct CubismModel from a URL. It
   * fetches model3.json as bytes, parses CubismModelSettingJson, fetches the
   * referenced moc3 bytes, then lets CubismUserModel create the
   * CubismRenderer_WebGL instance. Keep that ownership boundary here.
   */
  function MeowcoreCubismAdapter({ canvas, model, manifest, mapping, sdk, log }) {
    let frameId = 0;
    let controls = null;
    let state = 'loading';
    let message = 'initializing cubism renderer…';
    let appliedParameters = {};
    /** @type {any} */
    let userModel = null;
    /** @type {any} */
    let cubismModel = null;
    /** @type {any} */
    let cubismRenderer = null;
    /** @type {any} */
    let gl = null;
    /** @type {any} */
    let framework = null;
    let failed = false;
    let disposed = false;

    function fail(step, error) {
      if (failed || disposed) {
        return;
      }
      failed = true;
      state = 'error';
      message = 'cubism renderer error at ' + step + ': ' + errorMessage(error);
      if (log) {
        log('model error: ' + message);
      }
    }

    function parameterId(parameter) {
      const idManager = framework.CubismFramework.getIdManager();
      if (!idManager || typeof idManager.getId !== 'function') {
        throw new Error('official Cubism ID manager is unavailable');
      }
      return idManager.getId(parameter);
    }

    function drawFrame() {
      if (failed || disposed || !cubismModel || !cubismRenderer) {
        return;
      }
      frameId = requestAnimationFrame(drawFrame);
      try {
        if (!root.MeowcoreMapping) {
          throw new Error('shared mapping module (MeowcoreMapping) is missing');
        }
        if (typeof cubismModel.loadParameters === 'function') {
          cubismModel.loadParameters();
        }
        appliedParameters = root.MeowcoreMapping.applyMapping(
          mapping,
          controls || {}
        );
        for (const [parameter, parameterValue] of Object.entries(appliedParameters)) {
          cubismModel.setParameterValueById(
            parameterId(parameter),
            parameterValue,
            1.0
          );
        }
        cubismModel.update();

        const matrix = new framework.CubismMatrix44();
        matrix.loadIdentity();
        const modelMatrix = userModel.getModelMatrix();
        if (modelMatrix) {
          matrix.multiplyByMatrix(modelMatrix);
        }
        cubismRenderer.setMvpMatrix(matrix);
        cubismRenderer.setRenderState(null, [0, 0, canvas.width, canvas.height]);
        cubismRenderer.drawModel(sdk.shaderPath || null);
      } catch (error) {
        fail('frame', error);
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

      try {
        framework = root.Live2DCubismFramework;
        if (!framework) {
          throw new Error('Live2DCubismFramework global is missing');
        }
        requireOfficialSurface(framework);

        // The official sample starts the framework before constructing a
        // CubismModelSettingJson or CubismUserModel.
        framework.CubismFramework.startUp();
        framework.CubismFramework.initialize();

        gl =
          canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl');
        if (!gl) {
          throw new Error('WebGL context is unavailable on this canvas');
        }

        const model3Url = assetUrl(model.id, manifest.model3);
        const model3Buffer = await fetchArrayBuffer(model3Url, 'model3.json');
        const settings = new framework.CubismModelSettingJson(
          model3Buffer,
          model3Buffer.byteLength
        );
        const modelFileName = settings.getModelFileName();
        if (!modelFileName) {
          throw new Error('model3.json does not reference a moc3 file');
        }
        const mocBuffer = await fetchArrayBuffer(
          assetUrl(model.id, modelFileName),
          'moc3 model'
        );

        userModel = new framework.CubismUserModel();
        userModel.loadModel(mocBuffer);
        cubismModel = userModel.getModel();
        if (!cubismModel) {
          throw new Error('CubismUserModel did not create a CubismModel');
        }
        userModel.createRenderer(canvas.width, canvas.height);
        cubismRenderer = userModel.getRenderer();
        if (!cubismRenderer) {
          throw new Error('CubismUserModel did not create CubismRenderer_WebGL');
        }
        if (typeof cubismRenderer.setIsPremultipliedAlpha !== 'function') {
          throw new Error('official CubismRenderer.setIsPremultipliedAlpha() is missing');
        }
        // Cubism's official WebGL shader path requires premultiplied alpha.
        // Set the renderer state before any texture setup can occur.
        cubismRenderer.setIsPremultipliedAlpha(true);
        cubismRenderer.startUp(gl);
        try {
          await verifyShaderAssets(sdk.shaderPath, sdk.shaderFiles);
        } catch (error) {
          fail('shader-assets', error);
          return;
        }
        cubismRenderer.loadShaders(sdk.shaderPath || null);
        try {
          await waitForShaderReady(framework, gl);
        } catch (error) {
          fail('shader-load', error);
          return;
        }
        await loadTextures(settings, model.id, cubismRenderer, gl);

        state = 'ready';
        message = 'cubism model ready: ' + model.id;
        if (log) {
          log('model ready: ' + model.id);
        }
        frameId = requestAnimationFrame(drawFrame);
      } catch (error) {
        fail('model-load', error);
      }
    }

    function setControls(next) {
      controls = next;
    }

    function resize() {
      if (gl && userModel) {
        userModel.setRenderTargetSize(canvas.width, canvas.height);
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
      disposed = true;
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      if (userModel && typeof userModel.release === 'function') {
        userModel.release();
      }
      userModel = null;
      cubismModel = null;
      cubismRenderer = null;
      gl = null;
    }

    void initialize();
    return { kind: 'cubism', setControls, resize, status, dispose };
  }

  register('cubism', (options) => MeowcoreCubismAdapter(options));

  return {
    create,
    kinds,
    register,
    placeholderScale,
    MeowcoreCubismAdapter,
    verifyShaderAssets,
    waitForShaderReady,
  };
});
