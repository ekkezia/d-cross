import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ─────────────────────────────────────────────
// FLIP GRID CONFIG
// ─────────────────────────────────────────────

const flipConfig = {
  cols:          20,
  rows:          20,
  size:          20,
  speed:         3.5,
  video:         null,
  videoReady:    false,
};

function initFlipVideo() {
  flipConfig.video = document.createElement('video');
  flipConfig.video.src         = 'public/video.mov';
  flipConfig.video.loop        = true;
  flipConfig.video.muted       = true;
  flipConfig.video.defaultMuted = true;
  flipConfig.video.playsInline = true;
  flipConfig.video.autoplay    = true;
  flipConfig.video.preload     = 'auto';
  flipConfig.video.crossOrigin = 'anonymous';
  flipConfig.video.setAttribute('muted', '');
  flipConfig.video.setAttribute('playsinline', '');
  flipConfig.video.setAttribute('webkit-playsinline', '');
  flipConfig.video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;';
  document.body.appendChild(flipConfig.video);

  const tryVideoPlay = () => {
    flipConfig.video.play().catch(() => {});
  };

  const markReadyAndTryPlay = () => {
    flipConfig.videoReady = true;
    // Attempt autoplay; if blocked, retry on first pointer interaction
    flipConfig.video.play().catch(() => {
      window.addEventListener('pointerdown', tryVideoPlay, { once: true });
      window.addEventListener('keydown', tryVideoPlay, { once: true });
    });
  };

  flipConfig.video.addEventListener('loadeddata', markReadyAndTryPlay);
  flipConfig.video.addEventListener('canplaythrough', markReadyAndTryPlay);

  flipConfig.video.addEventListener('error', (e) => {
    console.error('Video error:', e, flipConfig.video.error);
  });

  flipConfig.video.load();

  gsap.delayedCall(5, () => {
    flipState.isAnimating = true;
    flipState.elapsed = 0;
    if (flipData) {
      for (let i = 0; i < flipData.angles.length; i++) {
        flipData.angles[i] = 0;
      }
    }
  });
}

let flipGrid = null;
let flipData = null;
let flipVideoTexture = null;
let flipState = {
  isAnimating: false,
  elapsed: 0,
  speed: 3.5 // radians/sec
};

function createFlipGrid() {
  const { cols, rows, size } = flipConfig;

  // Slightly smaller tiles for spacing + a thin depth for visible thickness.
  const tileSize = (size / 100) * 0.95;
  const tileDepth = (size / 100) * 0.08;
  const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileDepth);

  const count = cols * rows;

  const offsets = new Float32Array(count * 2);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // UV offsets for video texture sampling
    offsets[i * 2]     = col / cols;
    offsets[i * 2 + 1] = row / rows;

    // Position offsets for spacing
    positions[i * 3]     = (col - cols / 2 + 0.5) * (size / 100);
    positions[i * 3 + 1] = (row - rows / 2 + 0.5) * (size / 100);
    positions[i * 3 + 2] = 0;
  }

  geometry.setAttribute(
    'uvOffset',
    new THREE.InstancedBufferAttribute(offsets, 2)
  );

  const videoTexture = new THREE.VideoTexture(flipConfig.video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;
  flipVideoTexture = videoTexture;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      videoTex: { value: videoTexture },
      cols:     { value: cols },
      rows:     { value: rows }
    },
    vertexShader: `
      attribute vec2 uvOffset;
      varying vec2 vUv;

      uniform float cols;
      uniform float rows;

      void main() {
        vUv = uv / vec2(cols, rows) + uvOffset;

        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D videoTex;
      varying vec2 vUv;

      void main() {
        gl_FragColor = texture2D(videoTex, vUv);
      }
    `,
    side: THREE.DoubleSide
  });

  flipGrid = new THREE.InstancedMesh(geometry, material, count);
  flipGrid.position.set(0, -2, 0);
  flipGrid.rotation.y = Math.PI / 2;
  scene.add(flipGrid);

  // Set individual positions for each instance
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    dummy.updateMatrix();
    flipGrid.setMatrixAt(i, dummy.matrix);
  }
  flipGrid.instanceMatrix.needsUpdate = true;

  const angles = new Float32Array(count);
  const delays = new Float32Array(count);

  // Delay each tile by a fixed step so the sequence is visibly tile-by-tile.
  // Increase/decrease this to make the cascade slower/faster.
  const perTileDelay = 0.06;

  for (let i = 0; i < count; i++) {
    delays[i] = i * perTileDelay;
  }

  flipData = { angles, delays };
}


// ─────────────────────────────────────────────
// SCENE STATE
// ─────────────────────────────────────────────

const state = {
  threeDScene: null, // { mixer, model }
  twoDScene:   null, // { mixer }
};

// ─────────────────────────────────────────────
// RENDERER + SCENE + CAMERA
// ─────────────────────────────────────────────

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enabled       = false;

// ─────────────────────────────────────────────
// LIGHTS
// ─────────────────────────────────────────────

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near   =   0.5;
dirLight.shadow.camera.far    = 500;
dirLight.shadow.camera.left   = -50;
dirLight.shadow.camera.right  =  50;
dirLight.shadow.camera.top    =  50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// ─────────────────────────────────────────────
// OFF-SCREEN (2-D) RENDER TARGET
// ─────────────────────────────────────────────

const renderTarget = new THREE.WebGLRenderTarget(128, 128);
renderTarget.texture.minFilter       = THREE.NearestFilter;
renderTarget.texture.magFilter       = THREE.NearestFilter;
renderTarget.texture.generateMipmaps = false;

const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
orthoCamera.position.z = 2;
orthoCamera.lookAt(0, 0, 0);

const screenScene = new THREE.Scene();
screenScene.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  )
);

// ─────────────────────────────────────────────
// LOADING MANAGER
// ─────────────────────────────────────────────

const loadingOverlay = document.getElementById('loading');

const manager = new THREE.LoadingManager(
  () => {
    const PRETICK = 1 / 60;
    if (state.threeDScene?.mixer) state.threeDScene.mixer.update(PRETICK);
    if (state.twoDScene?.mixer)   state.twoDScene.mixer.update(PRETICK);

    const allObjects = [];
    scene.traverse(o     => { if (!o.visible) { o.visible = true; allObjects.push(o); } });
    screenScene.traverse(o => { if (!o.visible) { o.visible = true; allObjects.push(o); } });

    renderer.compile(scene, camera);
    renderer.compile(screenScene, orthoCamera);

    renderer.setRenderTarget(renderTarget);
    renderer.render(screenScene, orthoCamera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    allObjects.forEach(o => { o.visible = false; });

    loadingOverlay.style.display = 'none';
    startRenderLoop();
  },
  (url, loaded, total) => {
    loadingOverlay.innerText = `Loading ${Math.round((loaded / total) * 100)}%`;
  },
  (url) => console.error('Error loading:', url)
);

manager.onStart = () => { loadingOverlay.style.display = 'flex'; };

// ─────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────

const tempObject = new THREE.Object3D();

function normalizeModel(model, targetHeight = 1) {
  const box  = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  model.scale.setScalar(targetHeight / size.y);
  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.sub(center);
}

// ─────────────────────────────────────────────
// GRID WIREFRAME
// ─────────────────────────────────────────────

function createGridWireframe(boundingBox) {
  const size        = new THREE.Vector3();
  boundingBox.getSize(size);
  const lineSpacing = size.x;
  const steps       = size.z / 8;
  const vertices    = [];

  for (let z = boundingBox.min.z; z <= boundingBox.max.z; z += steps) {
    for (let y = boundingBox.min.y; y <= boundingBox.max.y; y += lineSpacing)
      vertices.push(boundingBox.min.x, y, z, boundingBox.max.x, y, z);
    for (let x = boundingBox.min.x; x <= boundingBox.max.x; x += lineSpacing)
      vertices.push(x, boundingBox.min.y, z, x, boundingBox.max.y, z);
  }

  for (let y = boundingBox.min.y; y <= boundingBox.max.y; y += lineSpacing)
    for (let x = boundingBox.min.x; x <= boundingBox.max.x; x += lineSpacing)
      vertices.push(x, y, boundingBox.min.z, x, y, boundingBox.max.z);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff })));
}

// ─────────────────────────────────────────────
// PIXEL GRID (screenScene overlay)
// ─────────────────────────────────────────────

function addPixelGrid(resolution = 32) {
  const step     = 2 / resolution;
  const vertices = [];
  for (let i = -1; i <= 1; i += step) {
    vertices.push(i, -1, 0.01, i,  1, 0.01);
    vertices.push(-1, i, 0.01,  1, i, 0.01);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  screenScene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 })));
}

// ─────────────────────────────────────────────
// RESERVED CENTRE CUBE
// ─────────────────────────────────────────────

let reservedCube = null;

function createReservedCube() {
  reservedCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshBasicMaterial({ map: renderTarget.texture })
  );
  reservedCube.position.set(0, -2, 0);
  reservedCube.rotation.x   = -Math.PI / 2;
  reservedCube.castShadow    = true;
  reservedCube.receiveShadow = true;
  scene.add(reservedCube);
}

// ─────────────────────────────────────────────
// POINT-CLOUD CUBES
// ─────────────────────────────────────────────

let cubes        = null;
let instanceData = null;

function loadPointCloud() {
  new THREE.FileLoader(manager).load('pointcloud.json', (text) => {
    const data = JSON.parse(text);
    const raw  = [];
    data.points.forEach(p => raw.push(p[0], p[1], p[2]));

    const tempGeo = new THREE.BufferGeometry();
    tempGeo.setAttribute('position', new THREE.Float32BufferAttribute(raw, 3));
    tempGeo.computeBoundingBox();
    const center = new THREE.Vector3();
    tempGeo.boundingBox.getCenter(center);

    const positions = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 3) {
      positions[i]     = raw[i]     - center.x;
      positions[i + 1] = raw[i + 1] - center.y;
      positions[i + 2] = raw[i + 2] - center.z;
    }

    const count   = positions.length / 3;
    const cubeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.7, metalness: 0.3,
      transparent: true, opacity: 1, depthWrite: true, depthTest: true,
    });

    cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), cubeMat, count);
    cubes.castShadow = cubes.receiveShadow = true;
    cubes.rotation.x = -Math.PI / 2;
    scene.add(cubes);

    const rotations = new Float32Array(count * 3);
    const speeds    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const ri = i * 3;
      speeds[ri]     = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
      speeds[ri + 1] = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
      speeds[ri + 2] = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
      tempObject.position.set(positions[ri], positions[ri + 1], positions[ri + 2]);
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      cubes.setMatrixAt(i, tempObject.matrix);
    }

    instanceData = { positions, rotations, speeds };

    const box3 = new THREE.Box3().setFromObject(cubes);
    createGridWireframe(box3);

    dirLight.shadow.camera.left   = box3.min.x - 10;
    dirLight.shadow.camera.right  = box3.max.x + 10;
    dirLight.shadow.camera.top    = box3.max.y + 10;
    dirLight.shadow.camera.bottom = box3.min.y - 10;
    dirLight.shadow.camera.updateProjectionMatrix();

    createReservedCube();
    initFlipVideo();
    createFlipGrid();
    loadRunwayHuman3D('public/model.fbx');
    loadRunwayHuman2D('public/walking-model2.fbx');
    animateCameraToCube();
  });
}

// ─────────────────────────────────────────────
// CAMERA ANIMATION
// ─────────────────────────────────────────────

const cam = {
  active: false,
  target: new THREE.Vector3(0, -2, 0),
  angle:  0,
  radius: 40,
  height: 20,
};

function applyCameraFromState() {
  if (!cam.active) return;
  camera.position.set(
    cam.target.x + Math.cos(cam.angle) * cam.radius,
    cam.target.y + cam.height,
    cam.target.z + Math.sin(cam.angle) * cam.radius,
  );
  camera.lookAt(cam.target);
}

function animateCameraToCube() {
  cam.active = true;
  applyCameraFromState();

  gsap.timeline()
    .to(cam, {
      angle: Math.PI, radius: 1, height: 0,
      duration: 6, ease: 'power2.inOut',
    }, 0)
    .to(cubes?.material ?? {}, {
      opacity: 0.01, duration: 6, ease: 'power2.inOut',
    }, 0)
    .to(cam, {
      radius: 0.7,
      duration: 10,
      ease: 'power1.out',
    }, 5);
}

// ─────────────────────────────────────────────
// 3-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function loadRunwayHuman3D(url) {

  new FBXLoader(manager).load(url, (object) => {
    const model = object;
    normalizeModel(model, 0.65);
    model.position.set(0, -2.35, 1);
    model.rotation.set(Math.PI, 0, Math.PI);
    model.visible = false;
    scene.add(model);

    const mixer  = new THREE.AnimationMixer(model);
    let   action = null;

    if (object.animations.length) {
      action = mixer.clipAction(object.animations[0]);
      action.loop = THREE.LoopRepeat;
      // Don't use clampWhenFinished with LoopRepeat
    }

    state.threeDScene = { 
      mixer, 
      model,
      action, // Store action so it stays referenced
      walkSpeed: 0.5, // units per second - adjust this to control speed
      startZ: 1 
    };

    gsap.delayedCall(4, () => {
      requestAnimationFrame(() => {
        model.visible = true;
        if (action) {
          action.reset().play();
        }
      });
    });
  });
}

// ─────────────────────────────────────────────
// 2-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function loadRunwayHuman2D(url) {
  new FBXLoader(manager).load(url, (object) => {
    const model = object;
    normalizeModel(model, 1);
    model.position.set(0, -1.5, 0);
    model.rotation.x = -Math.PI / 2;
    model.rotation.z = -Math.PI / 2;
    model.visible = false;
    screenScene.add(model);

    const mixer  = new THREE.AnimationMixer(model);
    let   action = null;

    if (object.animations.length) {
      action = mixer.clipAction(object.animations[0]);
      action.loop              = THREE.LoopOnce;
      action.clampWhenFinished = true;
    }

    gsap.delayedCall(4.5, () => {
      if (state.threeDScene?.mixer) {
        state.threeDScene.mixer.stopAllAction();
        state.threeDScene.mixer.setTime(0);
      }
      // Commented out - keeping 3D model visible
      // if (state.threeDScene?.model) {
      //   state.threeDScene.model.visible = false;
      // }

      requestAnimationFrame(() => {
        model.visible = true;
        action?.reset().play();
      });
    });

    state.twoDScene = { mixer };
  });

  addPixelGrid(32);
}

// ─────────────────────────────────────────────
// RENDER LOOP
// ─────────────────────────────────────────────

const clock = new THREE.Clock();
let   rafId = null;

function startRenderLoop() {
  if (rafId !== null) return;
  clock.start();
  renderLoop();
}

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);
  const delta = clock.getDelta();

  // Keep video playback active and force frame upload fallback for the shader texture.
  if (flipConfig.videoReady && flipConfig.video) {
    if (flipConfig.video.paused) {
      flipConfig.video.play().catch(() => {});
    }
    if (flipVideoTexture && flipConfig.video.readyState >= flipConfig.video.HAVE_CURRENT_DATA) {
      flipVideoTexture.needsUpdate = true;
    }
  }

  // ── Point-cloud cube rotations ──
  if (cubes && instanceData) {
    const { positions, rotations, speeds } = instanceData;
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      const pi = i * 3;
      rotations[pi]     += speeds[pi]     * delta;
      rotations[pi + 1] += speeds[pi + 1] * delta;
      rotations[pi + 2] += speeds[pi + 2] * delta;
      tempObject.position.set(positions[pi], positions[pi + 1], positions[pi + 2]);
      tempObject.rotation.set(rotations[pi], rotations[pi + 1], rotations[pi + 2]);
      tempObject.updateMatrix();
      cubes.setMatrixAt(i, tempObject.matrix);
    }
    cubes.instanceMatrix.needsUpdate = true;
  }

  // ── Animation mixers ──
  if (state.threeDScene?.mixer) {
    state.threeDScene.mixer.update(delta);
    // Ensure action keeps playing if model is visible
    if (state.threeDScene.model?.visible && state.threeDScene.action && !state.threeDScene.action.isRunning()) {
      state.threeDScene.action.play();
    }
  }
  if (state.twoDScene?.mixer) {
    state.twoDScene.mixer.update(delta);
  }

  // ── Move 3D runway model forward while walking ──
  if (state.threeDScene?.model && state.threeDScene.model.visible) {
    const model = state.threeDScene.model;
    const walkSpeed = state.threeDScene.walkSpeed || 0.5;
    
    // Model faces negative Z direction (toward camera), so move in -Z
    model.position.z -= walkSpeed * delta;
    
    // Stop and hide when reaching z = 0
    if (model.position.z <= 0) {
      model.visible = false;
      if (state.threeDScene.action) {
        state.threeDScene.action.stop();
      }
    }
  }

  // ── WebGL flip grid animation ──
  if (flipGrid && flipData && flipState.isAnimating) {
    flipState.elapsed += delta;
    
    const { cols, rows } = flipConfig;
    const count = flipData.angles.length;
    const dummy = new THREE.Object3D();
    
    // Update each tile's rotation angle
    for (let i = 0; i < count; i++) {
      const timeIntoFlip = flipState.elapsed - flipData.delays[i];
      if (timeIntoFlip > 0) {
        flipData.angles[i] = Math.min(Math.PI / 2, timeIntoFlip * flipState.speed);
      }
      
      // Apply rotation to instance matrix
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = (col - cols / 2 + 0.5) * (flipConfig.size / 100);
      const y = (row - rows / 2 + 0.5) * (flipConfig.size / 100);
      
      dummy.position.set(x, y, 0);
      dummy.rotation.set(flipData.angles[i], 0, 0);
      dummy.updateMatrix();
      flipGrid.setMatrixAt(i, dummy.matrix);
    }
    
    flipGrid.instanceMatrix.needsUpdate = true;
    
    // Stop animating when last row has finished
    const maxDelay = Math.max(...flipData.delays);
    if (flipState.elapsed > maxDelay + (Math.PI / 2) / flipState.speed) {
      flipState.isAnimating = false;
    }
  }

  // ── Camera ──
  applyCameraFromState();

  // ── Off-screen render target ──
  renderer.setRenderTarget(renderTarget);
  renderer.render(screenScene, orthoCamera);
  renderer.setRenderTarget(null);

  // ── Main scene ──
  renderer.render(scene, camera);
}

// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

loadPointCloud();
