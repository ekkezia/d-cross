import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─────────────────────────────────────────────
// FLIP GRID CONFIG
// ─────────────────────────────────────────────

const flipConfig = {
  cols:          20,
  rows:          20,
  size:          20,
  speed:         100,
  video:         null,
  videoReady:    false,
};

const pointCloudGeneration = {
  enabled: true,
  input: "public/bridge.glb",
  output: "pointcloud.json",
  numPoints: 10000,
  scale: 70,
  rotXDeg: 0,
  rotYDeg: 90,
  rotZDeg: 0,
};

function initFlipVideo() {
  flipConfig.video = document.createElement('video');
  flipConfig.video.loop         = true;
  flipConfig.video.muted        = true;
  flipConfig.video.defaultMuted = true;
  flipConfig.video.playsInline  = true;
  flipConfig.video.autoplay     = true;
  flipConfig.video.preload      = 'auto';
  flipConfig.video.crossOrigin  = 'anonymous';
  flipConfig.video.setAttribute('muted', '');
  flipConfig.video.setAttribute('playsinline', '');
  flipConfig.video.setAttribute('webkit-playsinline', '');
  flipConfig.video.src          = 'public/video.mp4';
  flipConfig.video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;';
  document.body.appendChild(flipConfig.video);

  const tryVideoPlay = () => {
    flipConfig.video.play().catch(() => {});
  };

  const markReadyAndTryPlay = () => {
    flipConfig.videoReady = true;
    // Attempt autoplay; if blocked, retry on first interaction.
    flipConfig.video.play().catch(() => {
      window.addEventListener('pointerdown', tryVideoPlay, { once: true });
      window.addEventListener('keydown', tryVideoPlay, { once: true });
    });
  };

  flipConfig.video.addEventListener('loadedmetadata', markReadyAndTryPlay);
  flipConfig.video.addEventListener('loadeddata', markReadyAndTryPlay);
  flipConfig.video.addEventListener('canplaythrough', markReadyAndTryPlay);
  flipConfig.video.addEventListener('playing', () => {
    flipConfig.videoReady = true;
  });

  flipConfig.video.addEventListener('error', (e) => {
    console.error('Video error:', e, flipConfig.video.error);
  });

  flipConfig.video.load();

  gsap.delayedCall(10, () => {
    flipState.isAnimating = true;
    flipState.elapsed = 0;
    flipState.spacingProgress = 0;
    flipCenterRowLineShown = false;
    if (flipCenterRowLine) {
      flipCenterRowLine.visible = false;
      flipCenterRowLine.material.opacity = 0;
    }
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
let lastVideoTime = -1;
let flipStaticSideFaces = [];
let staticSidesBuilt = false;
let staticSidesHidden = false;
let staticSidesFadePending = false;
let staticSidesPendingFadeDuration = 0.8;
let flipCenterRowLine = null;
let flipCenterRowLineShown = false;
let flipState = {
  isAnimating: false,
  elapsed: 0,
  speed: 20, // radians/sec
  spacingProgress: 0, // 0 = current gaps, 1 = zero gaps
};

function createFlipGrid() {
  const { cols, rows, size } = flipConfig;

  // Slightly smaller tiles for spacing + a thin depth for visible thickness.
  const tileSize = (size / 100) * 0.95;
  const tileDepth = (size / 100) * 0.02;
  const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileDepth);

  const count = cols * rows;

  const offsets = new Float32Array(count * 2);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Per-instance tile index in UV space.
    offsets[i * 2] = col / cols;
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
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  flipVideoTexture = videoTexture;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      videoTex: { value: videoTexture },
      cols: { value: cols },
      rows: { value: rows },
    },
    vertexShader: `
      attribute vec2 uvOffset;
      varying vec2 vTileUv;
      uniform float cols;
      uniform float rows;

      void main() {
        // Center sample point of this tile in the source video.
        vTileUv = uvOffset + vec2(0.5 / cols, 0.5 / rows);
        vTileUv.x = 1.0 - vTileUv.x;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D videoTex;
      varying vec2 vTileUv;

      void main() {
        gl_FragColor = texture2D(videoTex, vTileUv);
      }
    `,
    side: THREE.DoubleSide,
  });

  flipGrid = new THREE.InstancedMesh(geometry, material, count);
const cubeSize = new THREE.Vector3();
new THREE.Box3().setFromObject(reservedCube).getSize(cubeSize);

flipGrid.position.set(-cubeSize.x / 2, -2.1, 0);
  flipGrid.rotation.y = Math.PI / 2;
  flipGrid.scale.setScalar(0.15);
  scene.add(flipGrid);
  alignBridgeDebugMeshToFlipGridCenter();

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
  const perTileDelay = 0.03;

  for (let i = 0; i < count; i++) {
    delays[i] = i * perTileDelay;
  }

  const maxDelay = delays[delays.length - 1] ?? 0;
  const totalDuration = maxDelay + (Math.PI / 2) / flipState.speed;
  flipData = { angles, delays, totalDuration };
}

function createStaticFlipGridSides() {
  if (staticSidesBuilt || !flipGrid || !reservedCube || !flipConfig.video) return;
  if (flipConfig.video.readyState < flipConfig.video.HAVE_CURRENT_DATA) return;
  if (!flipConfig.video.videoWidth || !flipConfig.video.videoHeight) return;

  const canvas = document.createElement('canvas');
  canvas.width = flipConfig.video.videoWidth;
  canvas.height = flipConfig.video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(flipConfig.video, 0, 0, canvas.width, canvas.height);

  const staticTexture = new THREE.CanvasTexture(canvas);
  staticTexture.minFilter = THREE.LinearFilter;
  staticTexture.magFilter = THREE.LinearFilter;
  staticTexture.generateMipmaps = false;
  staticTexture.colorSpace = THREE.SRGBColorSpace;

  const { cols, rows } = flipConfig;
  const source = flipGrid;
  const tempMatrix = new THREE.Matrix4();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      staticTex: { value: staticTexture },
      cols: { value: cols },
      rows: { value: rows },
      uOpacity: { value: 1.0 },
    },
    vertexShader: `
      attribute vec2 uvOffset;
      varying vec2 vTileUv;
      uniform float cols;
      uniform float rows;

      void main() {
        vTileUv = uvOffset + vec2(0.5 / cols, 0.5 / rows);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D staticTex;
      varying vec2 vTileUv;
      uniform float uOpacity;

      void main() {
        vec4 color = texture2D(staticTex, vTileUv);
        color.a *= uOpacity;
        gl_FragColor = color;
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  const createFace = () => {
    const mesh = new THREE.InstancedMesh(source.geometry, material.clone(), source.count);
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, tempMatrix);
      mesh.setMatrixAt(i, tempMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.scale.copy(source.scale);
    return mesh;
  };

  const cubeSize = new THREE.Vector3();
  new THREE.Box3().setFromObject(reservedCube).getSize(cubeSize);
  const cubeWidth = cubeSize.x;
  const cubeHeight = cubeSize.y;
  const cubeDepth = cubeSize.z;
  const staticBackOffsetX = -cubeSize.x;

  const center = flipGrid.position.clone();
  center.x += cubeWidth * 0.5;

  const frontNormal = new THREE.Vector3(0, 0, 1).applyEuler(flipGrid.rotation).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyEuler(flipGrid.rotation).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  const sides = [
    { offset: frontNormal.clone().multiplyScalar(cubeDepth * 0.5), normal: frontNormal.clone().negate() }, // back
    { offset: right.clone().multiplyScalar(cubeWidth * 0.5), normal: right.clone() }, // right
    { offset: right.clone().multiplyScalar(-cubeWidth * 0.5), normal: right.clone().negate() }, // left
    { offset: up.clone().multiplyScalar(cubeHeight * 0.5), normal: up.clone() }, // top (face up)
    { offset: up.clone().multiplyScalar(-cubeHeight * 0.5), normal: up.clone().negate() }, // bottom
  ];

  flipStaticSideFaces = [];
  for (let i = 0; i < sides.length; i++) {
    const side = sides[i];
    const mesh = createFace();
    mesh.position.copy(center).add(side.offset);
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side.normal.clone().normalize());
    mesh.quaternion.copy(quat);
    scene.add(mesh);
    flipStaticSideFaces.push(mesh);
  }

  // Keep dynamic front flip plane visible.
  flipGrid.visible = true;
  staticSidesBuilt = true;
  if (staticSidesFadePending && !staticSidesHidden) {
    fadeOutStaticSideFaces(staticSidesPendingFadeDuration);
  }
}

function showStaticSideFaces() {
  staticSidesHidden = false;
  staticSidesFadePending = false;
  for (let i = 0; i < flipStaticSideFaces.length; i++) {
    const face = flipStaticSideFaces[i];
    face.visible = true;
    const mat = face.material;
    if (mat?.uniforms?.uOpacity) {
      gsap.killTweensOf(mat.uniforms.uOpacity);
      mat.uniforms.uOpacity.value = 1.0;
    }
  }
}

function fadeOutStaticSideFaces(duration = 0.8) {
  if (staticSidesHidden) return;
  staticSidesPendingFadeDuration = duration;
  staticSidesFadePending = true;
  if (!flipStaticSideFaces.length) return;

  staticSidesFadePending = false;
  staticSidesHidden = true;
  for (let i = 0; i < flipStaticSideFaces.length; i++) {
    const face = flipStaticSideFaces[i];
    const mat = face.material;
    if (mat?.uniforms?.uOpacity) {
      gsap.killTweensOf(mat.uniforms.uOpacity);
      gsap.to(mat.uniforms.uOpacity, {
        value: 0,
        duration,
        ease: 'power2.out',
        onComplete: () => {
          face.visible = false;
        },
      });
    } else {
      face.visible = false;
    }
  }
}

// function createFlipCenterRowLine() {
//   if (!flipGrid || flipCenterRowLine) return;

//   const { cols, rows, size } = flipConfig;
//   const tightStep = (size / 100) * 0.95;
//   const centerRow = Math.floor(rows / 2);
//   const targetRow = Math.min(rows - 1, centerRow + 3);
//   const rowY = (targetRow - rows / 2 + 0.5) * tightStep;
//   const longHalfSpan = Math.max(50, cols * tightStep * 10);
//   const xMin = -longHalfSpan;
//   const xMax = longHalfSpan;

//   const lineGeometry = new THREE.BufferGeometry().setFromPoints([
//     new THREE.Vector3(xMin, rowY, 0.02),
//     new THREE.Vector3(xMax, rowY, 0.02),
//   ]);
//   const lineMaterial = new THREE.LineBasicMaterial({
//     color: 0xff0000,
//     transparent: true,
//     opacity: 0,
//     depthTest: false,
//   });

//   flipCenterRowLine = new THREE.Line(lineGeometry, lineMaterial);
//   flipCenterRowLine.visible = false;
//   flipGrid.add(flipCenterRowLine);
// }


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
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.03, 1000);
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

function forEachObjectMaterial(object3D, callback) {
  object3D.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      for (let i = 0; i < child.material.length; i++) callback(child.material[i]);
      return;
    }
    callback(child.material);
  });
}

function prepareObjectForFade(object3D) {
  forEachObjectMaterial(object3D, (material) => {
    material.transparent = true;
    material.depthWrite = false;
    material.needsUpdate = true;
  });
}

function setObjectOpacity(object3D, opacity) {
  forEachObjectMaterial(object3D, (material) => {
    material.opacity = opacity;
  });
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
    new THREE.MeshBasicMaterial({ map: renderTarget.texture, transparent: true, opacity: 1 })
  );
  reservedCube.position.set(0, -2, 0);
  reservedCube.rotation.x   = -Math.PI / 2;
  reservedCube.visible = false;
  reservedCube.castShadow    = true;
  reservedCube.receiveShadow = true;
  scene.add(reservedCube);
}

// ─────────────────────────────────────────────
// POINT-CLOUD CUBES
// ─────────────────────────────────────────────

let cubes        = null;
let instanceData = null;
let bridgeDebugMesh = null;
const bridgeDebugState = { opacity: 0.45 };

function alignBridgeDebugMeshToFlipGridCenter() {
  if (!bridgeDebugMesh || !flipGrid) return;
  bridgeDebugMesh.position.copy(flipGrid.position);
  bridgeDebugMesh.position.y += 4.5;
}

function setBridgeDebugMeshOpacity(opacity) {
  bridgeDebugState.opacity = opacity;
  if (!bridgeDebugMesh) return;
  setObjectOpacity(bridgeDebugMesh, opacity);
}

function loadBridgeDebugMesh(url) {
  new GLTFLoader(manager).load(url, (gltf) => {
    const model = gltf.scene;
    if (!model) return;

    // Match point-cloud centering so mesh and cubes are directly comparable.
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);

    // Match point-cloud world orientation (Y-axis rotation for debug alignment).
    model.rotation.x = 0;
    model.rotation.y = Math.PI / 2;
    model.rotation.z = 0;
    // Debug alignment scale for bridge mesh vs point-cloud cubes.
    model.scale.setScalar(70);

    // Make it semi-transparent for side-by-side visual debugging.
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = bridgeDebugState.opacity;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      });
    });

    bridgeDebugMesh = model;
    setBridgeDebugMeshOpacity(bridgeDebugState.opacity);
    alignBridgeDebugMeshToFlipGridCenter();
    scene.add(model);
  });
}

async function generatePointCloudOnInit() {
  if (!pointCloudGeneration.enabled) return;

  loadingOverlay.style.display = "flex";
  loadingOverlay.innerText = "Generating point cloud...";

  const response = await fetch("/api/generate-pointcloud", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pointCloudGeneration),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `Generation request failed (${response.status})`);
  }
}

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
      transparent: true, opacity: 1, depthWrite: false, depthTest: true,
    });

    cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), cubeMat, count);
    cubes.castShadow = cubes.receiveShadow = true;
    cubes.rotation.x = 0;
    cubes.rotation.y = 0;
    cubes.rotation.z = 0;
    cubes.position.y += 3;
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
    loadBridgeDebugMesh('public/bridge.glb');

    dirLight.shadow.camera.left   = box3.min.x - 10;
    dirLight.shadow.camera.right  = box3.max.x + 10;
    dirLight.shadow.camera.top    = box3.max.y + 10;
    dirLight.shadow.camera.bottom = box3.min.y - 10;
    dirLight.shadow.camera.updateProjectionMatrix();

    createReservedCube();
    initFlipVideo();
    createFlipGrid();
    loadRunwayHuman3D('public/model.fbx');
    loadRunwayHuman2D();
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
  fov: 75,
};

function applyCameraFromState() {
  if (!cam.active) return;
  camera.position.set(
    cam.target.x + Math.cos(cam.angle) * cam.radius,
    cam.target.y + cam.height,
    cam.target.z + Math.sin(cam.angle) * cam.radius,
  );
  if (Math.abs(camera.fov - cam.fov) > 1e-3) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
  camera.lookAt(cam.target);
}

function animateCameraToCube() {
  cam.active = true;
  applyCameraFromState();
  const introBridgeHold = 1.2;
  const bridgeFadeDuration = 4;
  const crossFadeOverlap = bridgeFadeDuration;
  const staticSideFadeOffset = 5.0;
  const staticSideFadeDuration = 2.0;
  const cubesFadeInDuration = 8.0;
  const cubesFadeOutStartOffset = 0.0;
  const cubesFadeOutDuration = 8.0;
  const bridgeFadeEase = 'none';
  const bridgeFadeStart = introBridgeHold;
  const bridgeFadeEnd = bridgeFadeStart + bridgeFadeDuration;
  const revealStart = Math.max(bridgeFadeStart, bridgeFadeEnd - crossFadeOverlap);
  const cameraMoveStart = bridgeFadeEnd * 0.5;
  const cameraPreAngle = 0.18;
  const cameraPreRadius = 42;
  const cameraPreHeight = 19;
  const cubesFadeOutStart = cameraMoveStart;
  const bridgeStartOpacity = 0.45;
  const bridgeFade = { opacity: bridgeStartOpacity };
  showStaticSideFaces();
  setBridgeDebugMeshOpacity(bridgeStartOpacity);
  if (bridgeDebugMesh) bridgeDebugMesh.visible = true;
  if (cubes?.material) cubes.material.opacity = 0;

  gsap.timeline()
    .call(() => fadeOutStaticSideFaces(staticSideFadeDuration), [], cameraMoveStart + staticSideFadeOffset)
    .to(cam, {
      angle: cameraPreAngle,
      radius: cameraPreRadius,
      height: cameraPreHeight,
      duration: cameraMoveStart,
      ease: 'sine.inOut',
    }, 0)
    .to(bridgeFade, {
      opacity: 0,
      duration: bridgeFadeDuration,
      ease: bridgeFadeEase,
      onUpdate: () => setBridgeDebugMeshOpacity(bridgeFade.opacity),
    }, bridgeFadeStart)
    .to(cam, {
      angle: Math.PI, radius: 1, height: 0,
      duration: 8, ease: 'sine.inOut',
    }, cameraMoveStart)
    .to(cubes?.material ?? {}, {
      opacity: 1, duration: cubesFadeInDuration, ease: 'power2.out',
    }, revealStart)
    .to(cubes?.material ?? {}, {
      opacity: 0,
      duration: cubesFadeOutDuration,
      ease: 'power1.inOut',
    }, cubesFadeOutStart)
    .to(reservedCube?.material ?? {}, {
      opacity: 0,
      duration: 0.8,
      ease: 'power1.out',
    }, cameraMoveStart + 6)
    .to(cam, {
      radius: 0.4,
      duration: 15,
      ease: 'power1.out',
    }, cameraMoveStart + 5)
    // Gradually move toward ~85mm full-frame equivalent (vertical FOV ~16deg).
    .to(cam, {
      fov: 16,
      duration: 12,
      ease: 'power1.out',
    }, cameraMoveStart + 5)
    ;
}

// ─────────────────────────────────────────────
// 3-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function loadRunwayHuman3D(url) {

  new FBXLoader(manager).load(url, (object) => {
    const model = object;
    normalizeModel(model, 0.65);
    model.position.set(0, -2.45, 1);
    model.rotation.set(Math.PI, 0, Math.PI);
    forEachObjectMaterial(model, (material) => {
      material.flatShading = true;
      material.needsUpdate = true;
    });
    prepareObjectForFade(model);
    setObjectOpacity(model, 0);
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
      startZ: 1,
      isFadingOut: false,
      fadeState: { opacity: 0 },
    };

    gsap.delayedCall(8, () => {
      requestAnimationFrame(() => {
        state.threeDScene.isFadingOut = false;
        state.threeDScene.fadeState.opacity = 0;
        setObjectOpacity(model, 0);
        model.visible = true;
        if (action) {
          action.reset().play();
        }
        gsap.to(state.threeDScene.fadeState, {
          opacity: 1,
          duration: 0.8,
          ease: 'power2.out',
          onUpdate: () => setObjectOpacity(model, state.threeDScene.fadeState.opacity),
        });
      });
    });
  });
}

// ─────────────────────────────────────────────
// 2-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function loadRunwayHuman2D(url) {
  void url;
  createStaticFlipGridSides();
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

  // Keep video playback active and keep the VideoTexture fresh.
  if (flipConfig.video) {
    if (flipConfig.video.paused) {
      flipConfig.video.play().catch(() => {});
    }
    if (flipVideoTexture && flipConfig.video.readyState >= flipConfig.video.HAVE_CURRENT_DATA) {
      flipVideoTexture.needsUpdate = true;
    }
    if (flipConfig.video.currentTime !== lastVideoTime) {
      lastVideoTime = flipConfig.video.currentTime;
      flipConfig.videoReady = true;
    }
    if (!staticSidesBuilt) {
      createStaticFlipGridSides();
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
    const fadeState = state.threeDScene.fadeState;

    if (!state.threeDScene.isFadingOut) {
      // Model faces negative Z direction (toward camera), so move in -Z
      model.position.z -= walkSpeed * delta;

      // Fade out then hide when reaching z = 0
      if (model.position.z <= 0) {
        state.threeDScene.isFadingOut = true;
        gsap.killTweensOf(fadeState);
        gsap.to(fadeState, {
          opacity: 0,
          duration: 0.6,
          ease: 'power1.out',
          onUpdate: () => setObjectOpacity(model, fadeState.opacity),
          onComplete: () => {
            model.visible = false;
            state.threeDScene.isFadingOut = false;
            if (state.threeDScene.action) {
              state.threeDScene.action.stop();
            }
          },
        });
      }
    }
  }

  // ── WebGL flip grid animation ──
  if (flipGrid && flipGrid.visible && flipData && flipState.isAnimating) {
    flipState.elapsed += delta;
    const totalDuration = flipData.totalDuration || ((Math.max(...flipData.delays)) + (Math.PI / 2) / flipState.speed);
    flipState.spacingProgress = Math.min(1, flipState.elapsed / totalDuration);
    
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
      const baseStep = flipConfig.size / 100;
      const tightStep = baseStep * 0.95;
      const tileStep = THREE.MathUtils.lerp(baseStep, tightStep, flipState.spacingProgress);
      const x = (col - cols / 2 + 0.5) * tileStep;
      const y = (row - rows / 2 + 0.5) * tileStep;
      
      dummy.position.set(x, y, 0);
      dummy.rotation.set(flipData.angles[i], 0, 0);
      dummy.updateMatrix();
      flipGrid.setMatrixAt(i, dummy.matrix);
    }
    
    flipGrid.instanceMatrix.needsUpdate = true;
    
    // Stop animating when last row has finished
    if (flipState.elapsed > totalDuration) {
      flipState.isAnimating = false;
      if (!flipCenterRowLineShown) {
        // createFlipCenterRowLine();
        if (flipCenterRowLine) {
          flipCenterRowLine.visible = true;
          gsap.killTweensOf(flipCenterRowLine.material);
          gsap.to(flipCenterRowLine.material, {
            opacity: 1,
            duration: 1.2,
            ease: 'power2.out',
          });
          flipCenterRowLineShown = true;
        }
      }
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

async function boot() {
  try {
    await generatePointCloudOnInit();
  } catch (err) {
    console.warn("Point-cloud generation skipped, using existing pointcloud.json:", err);
  }
  loadPointCloud();
}

boot();
