import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// ─────────────────────────────────────────────
// SCENE STATE
// ─────────────────────────────────────────────

const state = {
  threeDScene: null, // { mixer }
  twoDScene:   null, // { mixer }
};

// ─────────────────────────────────────────────
// RENDERER + SCENE + CAMERA
// ─────────────────────────────────────────────

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

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
    // All assets loaded — pre-compile ALL shaders before hiding the
    // loading screen. This moves GPU shader compilation + geometry upload
    // to happen now (while loading is still shown) rather than on the
    // first frame each object becomes visible, which was causing the
    // mid-sequence hitches on both Safari and Arc.
    // Pre-tick every mixer by a tiny delta BEFORE compile.
    // The first mixer.update() forces Three.js to upload the skinned
    // mesh bone texture to the GPU. Without this, that upload happens on
    // the exact frame the animation starts — causing the 1s stall.
    // Doing it here, during the loading screen, makes it free.
    // Warm-up strategy:
    // 1. Tick each mixer enough to bind bone textures
    // 2. Make models briefly visible so the GPU processes their draw calls
    // 3. Do a full render of both scenes — this is what actually flushes
    //    the GPU pipeline (shaders, bone textures, instanced buffers)
    // 4. Hide models again before the render loop starts
    // All of this happens behind the loading screen, so it's free.
    const PRETICK = 1 / 60;
    if (state.threeDScene?.mixer) state.threeDScene.mixer.update(PRETICK);
    if (state.twoDScene?.mixer)   state.twoDScene.mixer.update(PRETICK);

    // Temporarily make all models visible so the GPU sees their draw calls
    const allObjects = [];
    scene.traverse(o => { if (!o.visible) { o.visible = true; allObjects.push(o); } });
    screenScene.traverse(o => { if (!o.visible) { o.visible = true; allObjects.push(o); } });

    renderer.compile(scene, camera);
    renderer.compile(screenScene, orthoCamera);

    renderer.setRenderTarget(renderTarget);
    renderer.render(screenScene, orthoCamera);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    // Hide them again — the sequence will reveal them at the right times
    allObjects.forEach(o => { o.visible = false; });

    loadingOverlay.style.display = 'none';
    startRenderLoop();
  },
  (url, loaded, total) => {
    loadingOverlay.innerText = `Loading ${Math.round((loaded / total) * 100)}%`;
  },
  (url) => console.error('Error loading:', url)
);

manager.onStart = () => {
  loadingOverlay.style.display = 'flex';
};

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
  screenScene.add(
    new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }))
  );
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

    // Centre geometry
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
      color:       0xffffff,
      roughness:   0.7,
      metalness:   0.3,
      transparent: true,
      opacity:     1,
      // depthWrite ON — Chromium is stricter than Safari about transparent
      // instanced mesh sorting; keeping it on prevents z-order flicker.
      depthWrite:  true,
      depthTest:   true,
    });

    cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), cubeMat, count);
    cubes.castShadow    = true;
    cubes.receiveShadow = true;
    cubes.rotation.x    = -Math.PI / 2;
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
    createFlipGrid();
    loadRunwayHuman3D('public/walking-model.fbx');
    loadRunwayHuman2D('public/walking-model2.fbx');
    animateCameraToCube();
  });
}

// ─────────────────────────────────────────────
// CAMERA ANIMATION
// ─────────────────────────────────────────────

// GSAP writes to this plain object every tick.
// The render loop reads it once per frame, just before renderer.render().
// This fully decouples GSAP's ticker from rAF timing, so a CPU spike
// mid-sequence can never cause a visible camera position jump.
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
  applyCameraFromState(); // seed frame 0

  gsap.timeline()
    .to(cam, {
      angle:    Math.PI,
      radius:   1,
      height:   0,
      duration: 6,
      ease:     'power2.inOut',
      // No onUpdate — render loop reads cam state each frame
    }, 0)
    .to(cubes?.material ?? {}, {
      opacity:  0.01,
      duration: 6,
      ease:     'power2.inOut',
    }, 0);
}

// ─────────────────────────────────────────────
// 3-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function loadRunwayHuman3D(url) {
  new FBXLoader(manager).load(url, (object) => {
    const model = object;

    normalizeModel(model, 1);
    model.position.set(0, -2.5, 2);
    model.rotation.set(Math.PI, 0, Math.PI);

    // Add to scene immediately (invisible) so renderer.compile() in
    // onLoad picks it up and uploads shaders + geometry to the GPU now,
    // not on the frame it becomes visible.
    model.visible = false;
    scene.add(model);

    const mixer  = new THREE.AnimationMixer(model);
    let   action = null;

    if (object.animations.length) {
      action = mixer.clipAction(object.animations[0]);
      action.loop              = THREE.LoopOnce;
      action.clampWhenFinished = true;
    }

    gsap.delayedCall(3, () => {
      requestAnimationFrame(() => {
        model.visible = true;
        action?.reset().play();

        // Hide after the clip duration — clampWhenFinished holds the last
        // frame so 'finished' event is unreliable when mixer.update() keeps
        // being called. Use the clip duration directly instead.
        const clipDuration = action ? action.getClip().duration : 2;
        gsap.delayedCall(clipDuration, () => {
          model.visible = false;
        });
      });
    });

    state.threeDScene = { mixer };
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

    // Same pattern — add invisible so compile() handles GPU upload upfront.
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

      requestAnimationFrame(() => {
        model.visible = true;
        action?.reset().play();

        // After the clip finishes, wait 2 frames for the final pose to
        // flush into the render target, then snapshot and start the flip.
        // Model stays visible so the render target keeps showing the pose.
        const clipDuration = action ? action.getClip().duration : 2;
        gsap.delayedCall(clipDuration, () => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            triggerFlipGrid();
          }));
        });
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
  if (rafId !== null) return; // never start twice
  clock.start();
  renderLoop();
}

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);

  // Single delta — consumed exactly once, shared by all subsystems
  const delta = clock.getDelta();

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
  state.threeDScene?.mixer?.update(delta);
  state.twoDScene?.mixer?.update(delta);

  // ── Flip grid tile animation ──
  updateFlipGrid(delta);

  // ── Camera — applied last, right before render, so it's always
  //    in sync with the frame being drawn regardless of GSAP tick timing ──
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
// FLIP-DOT GRID
// ─────────────────────────────────────────────

const FLIP_COLS       = 32;
const FLIP_ROWS       = 32;
const FLIP_TOTAL      = FLIP_COLS * FLIP_ROWS;
const RT_SIZE         = 128; // must match renderTarget dimensions

// Sized to exactly cover the reserved cube face.
// The cube is 0.6 units; tiles sit flush on its front face.
const TILE_W    = 0.6 / FLIP_COLS;
const TILE_H    = 0.6 / FLIP_ROWS;
const TILE_D    = 0.004; // very thin — this thin edge becomes the "line"

// Per-tile state tracked on CPU
const flipAngles  = new Float32Array(FLIP_TOTAL); // current rotation angle (radians)
const flipTargets = new Float32Array(FLIP_TOTAL); // target angle (0 = face-on, PI/2 = edge-on)
const flipActive  = new Uint8Array(FLIP_TOTAL);   // 1 while animating

let flipMesh      = null; // InstancedMesh, created once
let flipAnimating = false;

const FLIP_MAT_WHITE = new THREE.MeshBasicMaterial({
  color:       0xffffff,
  side:        THREE.DoubleSide,
  transparent: true,
  opacity:     0,             // starts invisible, fades in with the cube fading out
});

function createFlipGrid() {
  // After the spiral, the camera ends up roughly at (cos(PI), 0, sin(PI))
  // i.e. looking from the -X/+Z direction toward the origin.
  // The reservedCube is at (0,-2,0) with rotation.x = -PI/2.
  // With that rotation, the cube's local +Y face points toward world +Z.
  // So the face the camera sees is the cube's +Z world face.
  // We place the flip grid as a VERTICAL plane in front of that face.
  //
  // Tile geometry: flat square panel, thin on Z (depth away from camera).
  // At rest (rotation.y = 0) the tile faces the camera (XY plane, thin Z).
  // At rotation.y = PI/2 the tile is edge-on — just a thin line visible.

  // X = thin (depth into face), Y = tile height, Z = tile width
  const geo = new THREE.BoxGeometry(TILE_D, TILE_H, TILE_W);

  flipMesh = new THREE.InstancedMesh(geo, FLIP_MAT_WHITE, FLIP_TOTAL);
  flipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(flipMesh);

  // Camera ends at angle=PI → position (-1, 0, 0) relative to target,
  // looking toward +X. The cube face visible to camera = -X face.
  //
  // Each tile sits on this -X face as a flat square panel (YZ plane, thin X).
  // To flip from "white square" to "white line" as seen by camera,
  // the tile must rotate around world Z (its horizontal axis as seen by camera).
  // At rotation.z=0   → face-on (square), at rotation.z=PI/2 → edge-on (line).
  //
  // Tile geometry: thin on X (depth into/out of face), tall on Y, wide on Z.
  const faceX = reservedCube.position.x - 0.3 - 0.002;
  const cy    = reservedCube.position.y;
  const cz    = reservedCube.position.z;

  const dummy = new THREE.Object3D();
  for (let row = 0; row < FLIP_ROWS; row++) {
    for (let col = 0; col < FLIP_COLS; col++) {
      const idx = row * FLIP_COLS + col;
      dummy.position.set(
        faceX,
        cy + (row + 0.5 - FLIP_ROWS / 2) * TILE_H,
        cz + (col + 0.5 - FLIP_COLS / 2) * TILE_W
      );
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      flipMesh.setMatrixAt(idx, dummy.matrix);
    }
  }
  flipMesh.instanceMatrix.needsUpdate = true;
  flipMesh.visible = false;
}

function triggerFlipGrid() {
  if (!flipMesh || !reservedCube) return;

  // Snapshot pixel data before any fading starts
  const pixels = new Uint8Array(RT_SIZE * RT_SIZE * 4);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, RT_SIZE, RT_SIZE, pixels);

  for (let row = 0; row < FLIP_ROWS; row++) {
    for (let col = 0; col < FLIP_COLS; col++) {
      const idx = row * FLIP_COLS + col;
      const px  = Math.floor((col + 0.5) / FLIP_COLS * RT_SIZE);
      const py  = Math.floor((1 - (row + 0.5) / FLIP_ROWS) * RT_SIZE);
      const pi  = (py * RT_SIZE + px) * 4;
      flipTargets[idx] = pixels[pi] > 128 ? Math.PI / 2 : 0;
      flipAngles[idx]  = 0;
      flipActive[idx]  = 1;
    }
  }

  const FADE = 0.5; // seconds for crossfade

  // Show grid at opacity 0, then crossfade: cube fades out, grid fades in
  flipMesh.visible = true;
  FLIP_MAT_WHITE.opacity = 0;

  gsap.timeline({
    onComplete: () => {
      // Hide the cube entirely once fully faded — stops the render target
      // from being sampled unnecessarily (minor perf win)
      reservedCube.visible = false;
      // Start the flip animation only after the crossfade completes
      flipAnimating = true;
    }
  })
  .to(reservedCube.material, { opacity: 0, duration: FADE, ease: 'power1.inOut' }, 0)
  .to(FLIP_MAT_WHITE,        { opacity: 1, duration: FADE, ease: 'power1.inOut' }, 0);

  // Make cube material transparent so opacity tween works
  reservedCube.material.transparent = true;
}

// Global elapsed time since triggerFlipGrid() was called —
// drives the column-by-column wave with a single accumulator.
let flipElapsed = 0;

function updateFlipGrid(delta) {
  if (!flipAnimating || !flipMesh) return;

  const SPEED     = Math.PI * 4.0; // radians/sec — how fast each tile flips
  const COL_DELAY = 0.05;          // seconds of stagger between columns
  const dummy     = new THREE.Object3D();

  flipElapsed += delta;
  let anyActive = false;

  for (let col = 0; col < FLIP_COLS; col++) {
    // This column unlocks after col * COL_DELAY seconds
    const colUnlockTime = col * COL_DELAY;
    if (flipElapsed < colUnlockTime) continue; // not started yet

    // How long this column has been animating
    const colTime = flipElapsed - colUnlockTime;

    for (let row = 0; row < FLIP_ROWS; row++) {
      const idx = row * FLIP_COLS + col;
      if (!flipActive[idx]) continue;

      anyActive = true;

      const target    = flipTargets[idx];
      const step      = Math.sign(target - flipAngles[idx])
                        * Math.min(SPEED * delta, Math.abs(target - flipAngles[idx]));
      flipAngles[idx] += step;

      if (Math.abs(target - flipAngles[idx]) < 0.001) {
        flipAngles[idx] = target;
        flipActive[idx] = 0;
      }

      const tileCol = idx % FLIP_COLS;
      const tileRow = Math.floor(idx / FLIP_COLS);
      const faceX   = reservedCube.position.x - 0.3 - 0.002;
      dummy.position.set(
        faceX,
        reservedCube.position.y + (tileRow + 0.5 - FLIP_ROWS / 2) * TILE_H,
        reservedCube.position.z + (tileCol + 0.5 - FLIP_COLS / 2) * TILE_W
      );
      // Rotate around Z: 0 = square face-on, PI/2 = edge-on horizontal line
      dummy.rotation.set(0, 0, flipAngles[idx]);
      dummy.updateMatrix();
      flipMesh.setMatrixAt(idx, dummy.matrix);
    }
  }

  flipMesh.instanceMatrix.needsUpdate = true;

  if (!anyActive) {
    flipAnimating = false;
    flipElapsed   = 0; // reset for potential re-trigger
  }
}

// ─────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────

loadPointCloud();
