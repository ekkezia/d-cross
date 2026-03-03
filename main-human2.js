import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from 'gsap';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ─────────────────────────────────────────────
// DEBUG PARAMS (lil-gui)
// ─────────────────────────────────────────────
const ankleDebug = {
  dy: -30,          // vertical offset of ankle box from laneY
  laneY: 40,        // ThreeDPosition[1] - 0.3  (model Y height)
  laneX: 0,       // ThreeDPosition[0] - laneX  (model X lane)
  laneZOffset: 4,   // Z shift applied on top of walkZ (negative = toward camera / left)
  markerScale: 8.0, // uniform scale of ankle wireframe boxes
  marker1XOffset: -4,    // independent X offset for ankle marker 1
  marker2XOffset: 18, // additional X offset for ankle marker 2 (marker 1 stays fixed)
  marker2ZOffset: 12,    // independent Z offset for ankle marker 2
  marker2YOffset: 0,  // independent Y offset for ankle marker 2
};

// Secondary runway clone appears as a partial-opacity "ghost trail".
// Keep this disabled unless that effect is explicitly desired.
const runwayGhostTrailEnabled = true;

// ─────────────────────────────────────────────
// FLIP GRID CONFIG
// ─────────────────────────────────────────────

const flipConfig = {
  cols:          21,
  rows:          21,
  size:          20,
  speed:         100,
  video:         null,
  videoReady:    false,
};

const pointCloudGeneration = {
  enabled: true,
  input: "public/bridge.glb",
  output: "public/pointcloud-human.json",
  numPoints: 10000,
  scale: 70,
  rotXDeg: 0,
  rotYDeg: 90,
  rotZDeg: 0,
};

const blueMono = {
  sceneBg: 0x0d00ff,
  ambientLight: 0x6259ff,
  keyLight: 0xdbd9ff,
  fillLight: 0x04004c,
  gridLine: 0x333333,
  pixelBg: 0xc2bfff,
  pixelLine: 0x030033,
  pointCloud: 0xffffff,
  model: 0x3126ff, // 3d object model (4D mesh)
  modelRunway: 0x0a0566, // runway FBX human model
  reservedTint: 0x928cff,
  monoDark: 0x01001a,
  monoLight: 0xc2bfff,
  emissiveBridge: 0x030033,
  emissiveModel: 0x0a0a0a, // runway model
};

const palettes = {
  blue:   { three: { sceneBg: 0x0d00ff, ambientLight: 0x6259ff, keyLight: 0xdbd9ff, fillLight: 0x04004c, gridLine: 0xffffff, monoDark: 0x01001a, monoLight: 0xc2bfff, model: 0x1508cc, modelRunway: 0x0a0566 }, css: { '--p-matte': 'rgba(13,0,255,1)', '--p-border': 'rgba(194,191,255,0.48)', '--p-text': '#DBD9FF', '--p-canvas-bg': '#0d00ff', '--p-bar-bg': 'rgba(7,3,54,0.72)', '--p-bar-border': 'rgba(194,191,255,0.45)', '--p-bar-color': '#dbd9ff', '--p-btn-bg': 'rgba(12,8,84,0.9)', '--p-btn-border': 'rgba(194,191,255,0.55)' } },
  black:  { three: { sceneBg: 0x000000, ambientLight: 0x888888, keyLight: 0xffffff, fillLight: 0x111111, gridLine: 0xffffff, monoDark: 0x050505, monoLight: 0xdddddd, model: 0x444444, modelRunway: 0x1a1a1a }, css: { '--p-matte': 'rgba(0,0,0,1)', '--p-border': 'rgba(255,255,255,0.4)', '--p-text': '#ffffff', '--p-canvas-bg': '#000000', '--p-bar-bg': 'rgba(10,10,10,0.82)', '--p-bar-border': 'rgba(255,255,255,0.4)', '--p-bar-color': '#ffffff', '--p-btn-bg': 'rgba(30,30,30,0.9)', '--p-btn-border': 'rgba(255,255,255,0.45)' } },
  purple: { three: { sceneBg: 0x0d0020, ambientLight: 0x7b3bff, keyLight: 0xe8d5ff, fillLight: 0x1a0040, gridLine: 0xffffff, monoDark: 0x080018, monoLight: 0xd4b8ff, model: 0x4a18cc, modelRunway: 0x1e0a52 }, css: { '--p-matte': 'rgba(13,0,32,1)', '--p-border': 'rgba(212,184,255,0.5)', '--p-text': '#e8d5ff', '--p-canvas-bg': '#0d0020', '--p-bar-bg': 'rgba(15,5,40,0.82)', '--p-bar-border': 'rgba(212,184,255,0.45)', '--p-bar-color': '#e8d5ff', '--p-btn-bg': 'rgba(30,10,70,0.9)', '--p-btn-border': 'rgba(212,184,255,0.55)' } },
  gray:   { three: { sceneBg: 0xe0e0e0, ambientLight: 0x999999, keyLight: 0xffffff, fillLight: 0x666666, gridLine: 0x333333, monoDark: 0x444444, monoLight: 0xf5f5f5, model: 0xaaaaaa, modelRunway: 0x444444 }, css: { '--p-matte': 'rgba(220,220,220,1)', '--p-border': 'rgba(80,80,80,0.5)', '--p-text': '#222222', '--p-canvas-bg': '#e0e0e0', '--p-bar-bg': 'rgba(200,200,200,0.85)', '--p-bar-border': 'rgba(80,80,80,0.45)', '--p-bar-color': '#222222', '--p-btn-bg': 'rgba(180,180,180,0.9)', '--p-btn-border': 'rgba(80,80,80,0.6)' } },
};

window.applyPalette = function(id) {
  const p = palettes[id];
  if (!p) return;
  const t = p.three;
  // Update blueMono so resets use the correct palette colors
  Object.assign(blueMono, { sceneBg: t.sceneBg, ambientLight: t.ambientLight, keyLight: t.keyLight, fillLight: t.fillLight, gridLine: t.gridLine, monoDark: t.monoDark, monoLight: t.monoLight, model: t.model, modelRunway: t.modelRunway, pixelBg: t.monoLight });
  if (screenSceneBgMat) screenSceneBgMat.color.setHex(t.monoLight);
  // Three.js scene
  if (scene.background) scene.background.setHex(t.sceneBg);
  _ambientLight.color.setHex(t.ambientLight);
  dirLight.color.setHex(t.keyLight);
  fillLight.color.setHex(t.fillLight);
  wireframeMaterials.forEach(mat => { gsap.killTweensOf(mat.color); mat.color.setHex(t.gridLine); mat.opacity = 1; });
  if (flipGrid?.material?.uniforms?.monoDark) { gsap.killTweensOf(flipGrid.material.uniforms.monoDark.value); flipGrid.material.uniforms.monoDark.value.setHex(t.monoDark); }
  if (flipGrid?.material?.uniforms?.monoLight) { gsap.killTweensOf(flipGrid.material.uniforms.monoLight.value); flipGrid.material.uniforms.monoLight.value.setHex(t.monoLight); }
  flipStaticSideFaces.forEach(face => {
    if (face.material?.uniforms?.monoDark) { gsap.killTweensOf(face.material.uniforms.monoDark.value); face.material.uniforms.monoDark.value.setHex(t.monoDark); }
    if (face.material?.uniforms?.monoLight) { gsap.killTweensOf(face.material.uniforms.monoLight.value); face.material.uniforms.monoLight.value.setHex(t.monoLight); }
  });
  if (reservedCube?.material?.color) { gsap.killTweensOf(reservedCube.material.color); reservedCube.material.color.setHex(t.model); }
  extraReservedCubes.forEach(c => { if (c.material?.color) c.material.color.setHex(t.model); });
  [state.threeDScene?.model, state.threeDScene2?.model].forEach(m => {
    if (m) forEachObjectMaterial(m, mat => {
      if ('color' in mat && mat.color) mat.color.setHex(t.modelRunway ?? t.model);
      if ('emissive' in mat && mat.emissive) mat.emissive.setHex(blueMono.emissiveModel);
    });
  });
  // 4D GLB mesh + its mirrored copy
  [FourDMesh, secondFourDMesh].forEach(m => {
    if (m) forEachObjectMaterial(m, mat => {
      if ('color' in mat && mat.color) mat.color.setHex(t.model);
      if ('emissive' in mat && mat.emissive) mat.emissive.setHex(t.monoDark);
    });
  });
  // Ankle markers stay red regardless of palette
  [state.ankleMarker1, state.ankleMarker2, state.ankleConnector].forEach(obj => {
    if (obj?.material?.color) { gsap.killTweensOf(obj.material.color); obj.material.color.set(0xe62626); }
  });
  // CSS vars
  const root = document.documentElement.style;
  Object.entries(p.css).forEach(([k, v]) => root.setProperty(k, v));
  // Mark active button
  document.querySelectorAll('.palette-btn').forEach(btn => {
    btn.style.outline = btn.dataset.palette === id ? '2px solid currentColor' : 'none';
  });
};

const ThreeDPosition = [1, 24, 0];
const CameraTargetY = 9; // mid-body aim point, independent of ThreeDPosition

function initFlipVideo() {
  flipConfig.video = document.createElement('video');
  flipConfig.video.loop         = true;
  flipConfig.video.muted        = true;
  flipConfig.video.defaultMuted = true;
  flipConfig.video.playsInline  = true;
  flipConfig.video.autoplay     = false;
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
    // Video is ready but won't auto-play; wait for timeline trigger at 8s
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
}

let flipGrid = null;
let flipData = null;
let flipVideoTexture = null;
const wireframeMaterials = [];
let lastVideoTime = -1;
let flipStaticSideFaces = [];
let staticSidesBuilt = false;
let staticSidesHidden = false;
let staticSidesFadePending = false;
let staticSidesPendingFadeDuration = 0.8;
let flipCenterRowLine = null;
let flipCenterRowLineShown = false;
const flipGridBaseScale = 0.15;
const flipTileDepthStart = 0.05;
const flipTileDepthEnd = 0.00001;
const flipTileDepthState = { value: flipTileDepthStart };
let flipState = {
  isAnimating: false,
  elapsed: 0,
  speed: 60, // radians/sec
  spacingProgress: 0, // 0 = current gaps, 1 = zero gaps
};

function updateFlipGridInstanceMatrices() {
  if (!flipGrid || !flipData) return;
  const { cols, rows } = flipConfig;
  const count = flipData.angles.length;
  const depthScale = Math.max(flipTileDepthState.value / flipTileDepthStart, 1e-5);
  const baseStep = flipConfig.size / 100;
  const tightStep = baseStep * 0.95;
  const tileStep = THREE.MathUtils.lerp(baseStep, tightStep, flipState.spacingProgress);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - cols / 2 + 0.5) * tileStep;
    const y = (row - rows / 2 + 0.5) * tileStep;
    dummy.position.set(x, y, 0);
    dummy.rotation.set(flipData.angles[i], 0, 0);
    dummy.scale.set(1, 1, depthScale);
    dummy.updateMatrix();
    flipGrid.setMatrixAt(i, dummy.matrix);
  }
  flipGrid.instanceMatrix.needsUpdate = true;
}

function applyFlipGridDepth(depth) {
  const safeDepth = Math.max(depth, 1e-6);
  flipTileDepthState.value = safeDepth;
  updateFlipGridInstanceMatrices();
}

function setFlipGridOpacity(opacity) {
  if (!flipGrid || !flipGrid.material?.uniforms?.uOpacity) return;
  const clamped = THREE.MathUtils.clamp(opacity, 0, 1);
  flipGrid.material.uniforms.uOpacity.value = clamped;
  flipGrid.visible = clamped > 0.0001;
}

function resetFlipCascadeState(startAnimating = false) {
  flipState.isAnimating = startAnimating;
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
  updateFlipGridInstanceMatrices();
}

function createFlipGrid() {
  const { cols, rows, size } = flipConfig;

  // Slightly smaller tiles for spacing + a thin depth for visible thickness.
  const tileSize = (size / 100) * 0.95;
  const tileDepth = flipTileDepthStart;
  const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileDepth);

  const count = cols * rows;

  const offsets = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    // Per-instance tile index in UV space.
    offsets[i * 2] = col / cols;
    offsets[i * 2 + 1] = row / rows;
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
      monoDark: { value: new THREE.Color(blueMono.monoDark) },
      monoLight: { value: new THREE.Color(blueMono.monoLight) },
      uOpacity: { value: 1.0 },
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
      uniform vec3 monoDark;
      uniform vec3 monoLight;
      uniform float uOpacity;

      void main() {
        vec4 src = texture2D(videoTex, vTileUv);
        float luma = dot(src.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mono = mix(monoDark, monoLight, luma);
        gl_FragColor = vec4(mono, src.a * uOpacity);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });

  flipGrid = new THREE.InstancedMesh(geometry, material, count);
const cubeSize = new THREE.Vector3();
new THREE.Box3().setFromObject(reservedCube).getSize(cubeSize);

flipGrid.position.set(-cubeSize.x / 2 + ThreeDPosition[0], ThreeDPosition[1], ThreeDPosition[2] + 0);
flipGrid.rotation.y = Math.PI / 2;
  flipGrid.scale.setScalar(flipGridBaseScale);
  flipGrid.scale.x *= -1; // mirror horizontally so the figure walks right → left
  applyFlipGridDepth(flipTileDepthStart);
  setFlipGridOpacity(1);
  scene.add(flipGrid);
  alignFourDMeshToPointCloudCubesCenter();

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
  updateFlipGridInstanceMatrices();
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
      monoDark: { value: new THREE.Color(blueMono.monoDark) },
      monoLight: { value: new THREE.Color(blueMono.monoLight) },
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
      uniform vec3 monoDark;
      uniform vec3 monoLight;

      void main() {
        vec4 color = texture2D(staticTex, vTileUv);
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 mono = mix(monoDark, monoLight, luma);
        gl_FragColor = vec4(mono, color.a * uOpacity);
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
  center.x += cubeWidth * 0.5 * -1;

  const frontNormal = new THREE.Vector3(0, 0, -1).applyEuler(flipGrid.rotation).normalize();
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
    if (mat?.uniforms?.monoDark) {
      gsap.killTweensOf(mat.uniforms.monoDark.value);
      mat.uniforms.monoDark.value.set(blueMono.monoDark);
    }
    if (mat?.uniforms?.monoLight) {
      gsap.killTweensOf(mat.uniforms.monoLight.value);
      mat.uniforms.monoLight.value.set(blueMono.monoLight);
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

function createFlipCenterRowLine() {
  if (!flipGrid || flipCenterRowLine) return;

  const { cols, rows, size } = flipConfig;
  const tightStep = (size / 100) * 0.95;
  const centerRow = Math.floor(rows / 2);
  const targetRow = Math.min(rows - 1, centerRow + 3);
  const rowY = (targetRow - rows / 2 + 0.5) * tightStep;
  const longHalfSpan = Math.max(50, cols * tightStep * 10);
  const xMin = -longHalfSpan;
  const xMax = longHalfSpan;

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(xMin, rowY, 0.02),
    new THREE.Vector3(xMax, rowY, 0.02),
  ]);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0,
    depthTest: false,
  });

  flipCenterRowLine = new THREE.Line(lineGeometry, lineMaterial);
  flipCenterRowLine.visible = false;
  flipGrid.add(flipCenterRowLine);
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
scene.background = null; // transparent — body bg shows through

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.03, 1000);
camera.position.set(5, 4, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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

const _ambientLight = new THREE.AmbientLight(blueMono.ambientLight, 0.42);
scene.add(_ambientLight);

const dirLight = new THREE.DirectionalLight(blueMono.keyLight, 1.35);
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

const fillLight = new THREE.DirectionalLight(blueMono.fillLight, 0.6);
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// ─────────────────────────────────────────────
// OFF-SCREEN (2-D) RENDER TARGET
// ─────────────────────────────────────────────

const renderTarget = new THREE.WebGLRenderTarget(128, 128);
renderTarget.texture.minFilter       = THREE.NearestFilter;
renderTarget.texture.magFilter       = THREE.NearestFilter;
renderTarget.texture.generateMipmaps = false;
renderTarget.texture.wrapS           = THREE.RepeatWrapping;
renderTarget.texture.repeat.x        = -1; // mirror horizontally (walk right → left)
renderTarget.texture.offset.x        = 1;

const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
orthoCamera.position.z = 2;
orthoCamera.lookAt(0, 0, 0);

const screenScene = new THREE.Scene();
const screenSceneBgMat = new THREE.MeshBasicMaterial({ color: blueMono.pixelBg });
screenScene.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    screenSceneBgMat
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

    // Snap bar to 100%, hold, then animate backdrop back to normal, then fade out and start
    const bar   = document.getElementById('loading-bar');
    const label = document.getElementById('loading-pct');
    if (bar)   bar.style.width = '100%';
    if (label) label.textContent = '100%';

    setTimeout(() => {
      // Step 1: animate backdrop-filter back to clear
      loadingOverlay.style.backdropFilter = 'blur(0px) brightness(1)';
      loadingOverlay.style.webkitBackdropFilter = 'blur(0px) brightness(1)';
      loadingOverlay.style.background = 'rgba(13, 0, 255, 0)';
      setTimeout(() => {
        // Step 2: fade the whole overlay out
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
          loadingOverlay.style.display = 'none';
          initDimensionFrameOverlay();
          startRenderLoop();
        }, 520);
      }, 820); // wait for backdrop transition
    }, 600); // hold at 100% for 600ms
  },
  (url, loaded, total) => {
    const pct = Math.round((loaded / total) * 100);
    const bar = document.getElementById('loading-bar');
    const label = document.getElementById('loading-pct');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
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
    material.transparent = true;
    material.opacity = opacity;
    material.needsUpdate = true;
  });
}

function buildAxisValues(min, max, step) {
  const values = [min];
  const span = max - min;
  const safeStep = Math.max(step, 1e-6);
  if (span <= 1e-6) return values;
  for (let v = min + safeStep; v < max - 1e-6; v += safeStep) {
    values.push(v);
  }
  values.push(max);
  return values;
}

// ─────────────────────────────────────────────
// GRID WIREFRAME
// ─────────────────────────────────────────────

function createGridWireframe(boundingBox) {
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  const xStep = Math.max(size.x / 2, 1e-6);
  const yStep = Math.max(size.y / 6, 1e-6);
  const zStep = Math.max(size.z / 4, 1e-6);
  const xValues = buildAxisValues(boundingBox.min.x, boundingBox.max.x, xStep);
  const yValues = buildAxisValues(boundingBox.min.y, boundingBox.max.y, yStep);
  if (yValues.length >= 2) {
    // Add one extra horizontal band between top and the next lower band.
    const top = yValues[yValues.length - 1];
    const belowTop = yValues[yValues.length - 2];
    yValues.push((top + belowTop) * 0.5);
    yValues.sort((a, b) => a - b);
  }
  const zValues = buildAxisValues(boundingBox.min.z, boundingBox.max.z, zStep);
  const vertices = [];

  for (let zi = 0; zi < zValues.length; zi++) {
    const z = zValues[zi];
    for (let yi = 0; yi < yValues.length; yi++) {
      const y = yValues[yi];
      vertices.push(boundingBox.min.x, y, z, boundingBox.max.x, y, z);
    }
    for (let xi = 0; xi < xValues.length; xi++) {
      const x = xValues[xi];
      vertices.push(x, boundingBox.min.y, z, x, boundingBox.max.y, z);
    }
  }

  for (let yi = 0; yi < yValues.length; yi++) {
    const y = yValues[yi];
    for (let xi = 0; xi < xValues.length; xi++) {
      const x = xValues[xi];
      vertices.push(x, y, boundingBox.min.z, x, y, boundingBox.max.z);
    }
  }

  // Extra center guides so a line cuts through the reserved cube area.
  const cutY = reservedCube ? reservedCube.position.y : -2;
  vertices.push(
    boundingBox.min.x, cutY, center.z, boundingBox.max.x, cutY, center.z, // X-axis center cut
    center.x, cutY, boundingBox.min.z, center.x, cutY, boundingBox.max.z, // Z-axis center cut
  );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: blueMono.gridLine, transparent: true, opacity: 1 });
  wireframeMaterials.push(gridMat);
  scene.add(new THREE.LineSegments(geo, gridMat));
}

function createGroundWireGrid(boundingBox) {
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  // Match spacing logic from createGridWireframe.
  const xStep = Math.max(size.x / 2, 1e-6);
  const zStep = Math.max(size.z / 4, 1e-6);

  // Make floor lines much longer than the point-cloud bounds.
  const floorExtentScale = 14;
  const floorMinX = center.x - (size.x * floorExtentScale) * 0.5;
  const floorMaxX = center.x + (size.x * floorExtentScale) * 0.5;
  const floorMinZ = center.z - (size.z * floorExtentScale) * 0.5;
  const floorMaxZ = center.z + (size.z * floorExtentScale) * 0.5;

  const xValues = buildAxisValues(floorMinX, floorMaxX, xStep);
  const zValues = buildAxisValues(floorMinZ, floorMaxZ, zStep);
  const y = boundingBox.min.y;
  const vertices = [];

  for (let zi = 0; zi < zValues.length; zi++) {
    const z = zValues[zi];
    vertices.push(floorMinX, y, z, floorMaxX, y, z);
  }
  for (let xi = 0; xi < xValues.length; xi++) {
    const x = xValues[xi];
    vertices.push(x, y, floorMinZ, x, y, floorMaxZ);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const groundMat = new THREE.LineBasicMaterial({
    color: blueMono.gridLine,
    transparent: true,
    opacity: 0.8,
  });
  wireframeMaterials.push(groundMat);
  scene.add(new THREE.LineSegments(geo, groundMat));
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
  screenScene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: blueMono.pixelLine })));
}

// ─────────────────────────────────────────────
// RESERVED CENTRE CUBE
// ─────────────────────────────────────────────

let reservedCube = null;
const extraReservedCubes = [];
const extraCubesFade = { opacity: 0 };
const flipGridFade = { opacity: 1 };
const wireframeFade = { opacity: 1 };

function setExtraCubesOpacity(v) {
  extraCubesFade.opacity = v;
  for (let i = 0; i < extraReservedCubes.length; i++) {
    extraReservedCubes[i].material.opacity = v;
  }
}

function makeReservedCubeMesh() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshBasicMaterial({
      map: renderTarget.texture,
      color: blueMono.ambientLight,
      transparent: true,
      opacity: 1,
    })
  );
  mesh.rotation.x = 0;
  // mesh.scale.x = 1; // mirror horizontally so the figure walks right → left
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createReservedCube() {
  reservedCube = makeReservedCubeMesh();
  reservedCube.position.set(ThreeDPosition[0] - 0.5, ThreeDPosition[1], ThreeDPosition[2]);
  reservedCube.visible = false;
  scene.add(reservedCube);
}

function createExtraReservedCubes(box3, count = 20) {
  // Fixed positions spread across the human body volume.
  // Adjust any of these to reposition individual cubes.
  const positions = [
    // [ 1.2, 23.5,  0.4],  // upper head
    [-0.8, 22.0, -0.5],  // left temple
    [ 2.5, 21.0,  0.8],  // right shoulder
    [-1.5, 21.5, -0.9],  // left shoulder
    [ 0.8, 19.5,  0.3],  // upper chest
    [-0.3, 18.0,  1.1],  // mid chest
    [ 2.0, 17.5, -0.6],  // right armpit
    [-2.0, 17.0,  0.7],  // left arm
    [ 1.5, 15.5,  0.2],  // upper torso
    [-0.6, 14.8, -1.0],  // mid torso left
    [ 0.2, 13.5,  1.2],  // mid torso right
    [ 2.2, 12.5, -0.3],  // right waist
    [-1.8, 12.0,  0.5],  // left waist
    [ 0.5, 11.0,  0.9],  // hip
    [-0.9, 10.2, -0.8],  // upper left leg
    [ 1.7,  9.8,  0.6],  // upper right leg
    [-1.2,  8.5,  1.0],  // mid left leg
    [ 1.0,  8.0, -0.4],  // mid right leg
    [-0.4, 12.8,  1.5],  // front torso
    [ 3.0, 19.0,  0.1],  // far right shoulder
  ];

  for (let i = 0; i < Math.min(count, positions.length); i++) {
    const mesh = makeReservedCubeMesh();
    mesh.position.set(positions[i][0], positions[i][1], positions[i][2]);
    mesh.material.opacity = 0;
    mesh.visible = true;
    scene.add(mesh);
    extraReservedCubes.push(mesh);
  }
}

// ─────────────────────────────────────────────
// POINT-CLOUD CUBES
// ─────────────────────────────────────────────

let cubes        = null;
let instanceData = null;
let FourDMesh = null;
let secondFourDMesh = null;
const secondFourDState = { opacity: 0 };
let secondFourDRevealed = false;
const FourDState = { opacity: 1.0 };
let dimensionFrameTimeline = null;
const dimensionFrameAnimationEnabled = true;

function restartDimensionFrameTimeline() {
  if (!dimensionFrameAnimationEnabled || !dimensionFrameTimeline) return;
  dimensionFrameTimeline.restart(true);
}

function alignFourDMeshToPointCloudCubesCenter() {
  if (!FourDMesh || !cubes) return;
  FourDMesh.position.copy(cubes.position);
}

function setFourDMeshOpacity(opacity) {
  const clamped = THREE.MathUtils.clamp(opacity, 0, 1);
  FourDState.opacity = clamped;
  if (!FourDMesh) return;
  forEachObjectMaterial(FourDMesh, (material) => {
    const blended = clamped < 0.999;
    material.opacity = clamped;
    if (material.transparent !== blended) {
      material.transparent = blended;
      material.needsUpdate = true;
    }
    material.depthWrite = !blended;
  });
}

function initDimensionFrameOverlay() {
  const layers = [
    document.getElementById('dimension-layer-4d'),
    document.getElementById('dimension-layer-3d'),
    document.getElementById('dimension-layer-2d'),
    document.getElementById('dimension-layer-1d'),
  ];
  if (layers.some(layer => !layer)) return;

  const baseDurations = [4, 8, 16, 24]; // 4D -> 1D
  const resetDuration = 3.0; // quick animated return to inset 0
  const durationScales = [1, 1, 1, 1]; // 4D -> 1D
  const scaleDurations = baseDurations.slice(0, layers.length).map((d, i) => d * durationScales[i]);
  const cycleDuration = Math.max(...scaleDurations);
  const targetInsets = [6, 11, 18, 24];
  const startInsets = [0, 0, 0, 0];
  const insetStates = targetInsets.map((target, i) => ({
    value: target,
    target,
    start: startInsets[i],
  }));

  const applyInset = (layerIndex) => {
    const insetValue = insetStates[layerIndex].value;
    layers[layerIndex].style.inset = `${insetValue}%`;
  };

  const resetLayers = () => {
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      layer.style.visibility = 'visible';
      insetStates[i].value = insetStates[i].start;
      applyInset(i);
    }
  };

  if (dimensionFrameTimeline) {
    dimensionFrameTimeline.kill();
    dimensionFrameTimeline = null;
  }

  resetLayers();

  if (!dimensionFrameAnimationEnabled) {
    for (let i = 0; i < layers.length; i++) {
      insetStates[i].value = insetStates[i].target;
      applyInset(i);
    }
    return;
  }

  dimensionFrameTimeline = gsap.timeline({
    paused: true,
    defaults: { overwrite: 'auto' },
  });

  for (let i = 0; i < layers.length; i++) {
    dimensionFrameTimeline.fromTo(insetStates[i], {
      value: insetStates[i].start,
    }, {
      value: insetStates[i].target,
      duration: scaleDurations[i],
      ease: 'sine.inOut',
      onUpdate: () => applyInset(i),
    }, 0);
  }

  // After all frames reach their final insets, quickly reset all to start together.
  for (let i = 0; i < layers.length; i++) {
    dimensionFrameTimeline.to(insetStates[i], {
      value: insetStates[i].start,
      duration: resetDuration,
      ease: 'power2.inOut',
      onUpdate: () => applyInset(i),
    }, cycleDuration);
  }

  restartDimensionFrameTimeline();
}

function loadFourDMesh(url) {
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
    model.rotation.y = Math.PI/2;
    model.rotation.z = 0;
    // Debug alignment scale for bridge mesh vs point-cloud cubes.
    model.scale.setScalar(20);

    // Start fully solid; animation can still fade it out later.
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.transparent = false;
        mat.opacity = FourDState.opacity;
        mat.depthWrite = true;
        if ('map' in mat && mat.map) mat.map = null;
        if ('color' in mat && mat.color) mat.color.setHex(blueMono.model);
        if ('emissive' in mat && mat.emissive) mat.emissive.setHex(blueMono.monoDark);
        mat.needsUpdate = true;
      });
    });

    FourDMesh = model;
    setFourDMeshOpacity(FourDState.opacity);
    alignFourDMeshToPointCloudCubesCenter();
    scene.add(model);

    // Right-side light for FourD mesh — positioned relative to where the mesh actually lands in world space
    // The mesh is centered via position.sub(center) then scaled 20 and offset by cubes.position
    const fourDRightLight = new THREE.DirectionalLight(0xffffff, 2);
    fourDRightLight.position.set(-10, 30, -40); // comes from top-right (from camera view)
    fourDRightLight.target.position.set(0, 0, 0);
    scene.add(fourDRightLight);
    scene.add(fourDRightLight.target);
  });
}

function loadSecondFourDMesh(url) {
  new GLTFLoader(manager).load(url, (gltf) => {
    const model = gltf.scene;
    if (!model) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.sub(center);

    // Mirror rotation so the two models face each other
    model.rotation.x = 0;
    model.rotation.y = -Math.PI / 2;
    model.rotation.z = 0;
    model.scale.setScalar(20);

    // Position: same y-offset as the primary model, shifted +Z (screen-left)
    model.position.x += 20; // how close to the primary models
    model.position.y += 8; // up or down
    model.position.z += 8; //left or right
    model.scale.setScalar(20);

    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        mat.transparent = true;
        mat.opacity = 0;
        mat.depthWrite = false;
        if ('map' in mat && mat.map) mat.map = null;
        if ('color' in mat && mat.color) mat.color.setHex(blueMono.model);
        if ('emissive' in mat && mat.emissive) mat.emissive.setHex(blueMono.monoDark);
        mat.needsUpdate = true;
      });
    });

    secondFourDMesh = model;
    secondFourDState.opacity = 0;
    model.visible = false;
    scene.add(model);
  });
}

async function generatePointCloudOnInit() {
  if (!pointCloudGeneration.enabled) return;

  loadingOverlay.style.display = "flex";
  const loadingSpan = loadingOverlay.querySelector('#loading-label span');
  if (loadingSpan) loadingSpan.textContent = 'Generating point cloud…';
  else loadingOverlay.innerText = "Generating point cloud...";

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
  new THREE.FileLoader(manager).load('public/pointcloud-human.json', (text) => {
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
      color: blueMono.pointCloud,
      roughness: 0.8,
      metalness: 0.2,
      transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      wireframe: false,
    });

    cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), cubeMat, count);
    cubes.castShadow = cubes.receiveShadow = true;
    cubes.rotation.x = 0;
    cubes.rotation.y = Math.PI/2;
    cubes.rotation.z = 0;
    cubes.scale.setScalar(20);
    cubes.position.y += 7.95;
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
    // createGroundWireGrid(box3);
    loadFourDMesh('public/3d-model-human.glb');
    loadSecondFourDMesh('public/3d-model-human.glb');

    dirLight.shadow.camera.left   = box3.min.x - 10;
    dirLight.shadow.camera.right  = box3.max.x + 10;
    dirLight.shadow.camera.top    = box3.max.y + 10;
    dirLight.shadow.camera.bottom = box3.min.y - 10;
    dirLight.shadow.camera.updateProjectionMatrix();

    createReservedCube();
    createExtraReservedCubes(box3, 20);
    initFlipVideo();
    createFlipGrid();
    createFlipCenterRowLine();
    loadRunwayHuman3D('public/model.fbx');
    loadRunwayHuman2D();
  });
}

// ─────────────────────────────────────────────
// CAMERA ANIMATION
// ─────────────────────────────────────────────

const cameraLoopStart = {
  angle: Math.PI,
  radius: 50,
  height: 0,
  fov: 50,
};

const cam = {
  active: false,
  target: new THREE.Vector3(ThreeDPosition[0], CameraTargetY, ThreeDPosition[2]),
  angle: cameraLoopStart.angle,
  radius: cameraLoopStart.radius,
  height: cameraLoopStart.height,
  fov: cameraLoopStart.fov,
};
let cameraLoopTimeline = null;
const timelineUi = {
  container: null,
  playPauseBtn: null,
  scrubber: null,
  timeLabel: null,
  captureBtn: null,
  isScrubbing: false,
  visible: true,
};

function formatTimelineSeconds(value) {
  return value.toFixed(2);
}

function timelineCycleDuration() {
  if (!cameraLoopTimeline) return 1;
  return Math.max(cameraLoopTimeline.duration(), 0.001);
}

function updateTimelinePlayPauseLabel() {
  if (!timelineUi.playPauseBtn) return;
  if (!cameraLoopTimeline) {
    timelineUi.playPauseBtn.textContent = 'Play';
    timelineUi.playPauseBtn.disabled = true;
    return;
  }
  timelineUi.playPauseBtn.disabled = false;
  timelineUi.playPauseBtn.textContent = cameraLoopTimeline.paused() ? 'Play' : 'Pause';
}

function syncTimelineControls(force = false) {
  if (!timelineUi.scrubber || !timelineUi.timeLabel) return;

  if (!cameraLoopTimeline) {
    timelineUi.scrubber.min = '0';
    timelineUi.scrubber.max = '1';
    timelineUi.scrubber.value = '0';
    timelineUi.timeLabel.textContent = '0.00 / 0.00s';
    updateTimelinePlayPauseLabel();
    return;
  }

  const duration = timelineCycleDuration();
  const time = THREE.MathUtils.clamp(cameraLoopTimeline.time(), 0, duration);
  timelineUi.scrubber.min = '0';
  timelineUi.scrubber.max = String(duration);
  timelineUi.scrubber.step = '0.001';
  if (force || !timelineUi.isScrubbing) {
    timelineUi.scrubber.value = String(time);
  }
  timelineUi.timeLabel.textContent = `${formatTimelineSeconds(time)} / ${formatTimelineSeconds(duration)}s`;
  updateTimelinePlayPauseLabel();
}

function toggleTimelinePlayPause() {
  if (!cameraLoopTimeline) return;
  if (cameraLoopTimeline.paused()) {
    cameraLoopTimeline.play();
  } else {
    cameraLoopTimeline.pause();
  }
  syncTimelineControls(true);
}

function setTimelineControlsVisible(visible) {
  timelineUi.visible = visible;
  if (!timelineUi.container) return;
  timelineUi.container.style.display = visible ? 'flex' : 'none';
}

function toggleTimelineControlsVisibility() {
  setTimelineControlsVisible(!timelineUi.visible);
}

function captureCurrentCanvasFrame() {
  const canvas = renderer.domElement;
  if (!canvas) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const link = document.createElement('a');
  link.download = `frame-${timestamp}.png`;

  if (canvas.toBlob) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
    return;
  }

  link.href = canvas.toDataURL('image/png');
  link.click();
}

function initTimelineControls() {
  timelineUi.container = document.getElementById('timeline-controls');
  timelineUi.playPauseBtn = document.getElementById('timeline-play-pause');
  timelineUi.scrubber = document.getElementById('timeline-scrubber');
  timelineUi.timeLabel = document.getElementById('timeline-time');
  timelineUi.captureBtn = document.getElementById('timeline-capture');

  if (!timelineUi.container || !timelineUi.playPauseBtn || !timelineUi.scrubber || !timelineUi.timeLabel || !timelineUi.captureBtn) return;
  setTimelineControlsVisible(true);

  timelineUi.playPauseBtn.addEventListener('click', () => {
    toggleTimelinePlayPause();
  });

  timelineUi.scrubber.addEventListener('pointerdown', () => {
    timelineUi.isScrubbing = true;
  });
  timelineUi.scrubber.addEventListener('pointerup', () => {
    timelineUi.isScrubbing = false;
  });
  timelineUi.scrubber.addEventListener('input', () => {
    if (!cameraLoopTimeline) return;
    timelineUi.isScrubbing = true;
    cameraLoopTimeline.pause();
    const duration = timelineCycleDuration();
    const next = THREE.MathUtils.clamp(Number(timelineUi.scrubber.value) || 0, 0, duration);
    cameraLoopTimeline.time(next);
    syncTimelineControls(true);
  });
  timelineUi.scrubber.addEventListener('change', () => {
    timelineUi.isScrubbing = false;
  });

  timelineUi.captureBtn.addEventListener('click', () => {
    captureCurrentCanvasFrame();
  });

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      if (target.isContentEditable) return;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (target.tagName === 'INPUT') {
        const input = target;
        if (input.type !== 'range' && input.type !== 'button') return;
      }
    }
    event.preventDefault();
    toggleTimelineControlsVisibility();
  });

  syncTimelineControls(true);
}

function applyCameraFromState() {
  if (!cam.active || controls.enabled) return;
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

function resetLoopSceneState(bridgeOpacity) {
  // Reset runway model state
  if (FourDMesh) {
    FourDMesh.visible = true;
  }
  if (secondFourDMesh && !secondFourDRevealed) {
    secondFourDMesh.visible = false;
    secondFourDState.opacity = 0;
    forEachObjectMaterial(secondFourDMesh, (mat) => { mat.opacity = 0; });
  }
  setFourDMeshOpacity(bridgeOpacity);

  if (cubes?.material) {
    cubes.material.opacity = 0;
  }
  setExtraCubesOpacity(0);
  if (reservedCube?.material) {
    reservedCube.material.opacity = 1;
    gsap.killTweensOf(reservedCube.material.color);
    reservedCube.material.color.set(blueMono.ambientLight);
  }

  applyFlipGridDepth(flipTileDepthStart);
  setFlipGridOpacity(1);
  flipGridFade.opacity = 1;
  resetFlipCascadeState(false);
  showStaticSideFaces();
  if (flipGrid?.material?.uniforms?.monoDark) {
    gsap.killTweensOf(flipGrid.material.uniforms.monoDark.value);
    flipGrid.material.uniforms.monoDark.value.set(blueMono.monoDark);
  }
  if (flipGrid?.material?.uniforms?.monoLight) {
    gsap.killTweensOf(flipGrid.material.uniforms.monoLight.value);
    flipGrid.material.uniforms.monoLight.value.set(blueMono.monoLight);
  }
  wireframeMaterials.forEach(mat => {
    gsap.killTweensOf(mat.color);
    mat.color.set(blueMono.gridLine);
    mat.opacity = 1;
  });
  gsap.killTweensOf(wireframeFade);
  wireframeFade.opacity = 1;
  gsap.killTweensOf(flipGridFade);
  flipGridFade.opacity = 1;

  // Reset runway model state
  if (state.threeDScene?.model) {
    const model = state.threeDScene.model;
    model.visible = false;
    state.threeDScene.walkZ = state.threeDScene.startZ;
    state.threeDScene.isFadingOut = false;
    state.threeDScene.fadeState.opacity = 0;
    state.threeDScene.fadeState.fadingOut = false;
    setObjectOpacity(model, 0);
    if (state.threeDScene.action) {
      state.threeDScene.action.stop();
    }
  }
  if (state.threeDScene2?.model) {
    const m2 = state.threeDScene2;
    m2.model.visible = false;
    m2.walkZ = m2.startZ;
    m2.isFadingOut = false;
    m2.fadeState.opacity = 0;
    m2.fadeState.fadingIn = false;
    m2.fadeState.fadingOut = false;
    setObjectOpacity(m2.model, 0);
    if (m2.action) m2.action.stop();
  }
  // sc2EverAppeared is intentionally NOT reset — marker1, marker2 + connector stay visible from first appearance onward
  [state.ankleMarker1, state.ankleMarker2, state.ankleConnector].forEach(obj => {
    if (obj?.material?.color) { gsap.killTweensOf(obj.material.color); obj.material.color.set(0xe62626); }
  });

  // Reset video to start
  if (flipConfig.video) {
    flipConfig.video.pause();
    flipConfig.video.currentTime = 0;
  }
}

function animateCameraToCube() {
  if (cameraLoopTimeline) {
    cameraLoopTimeline.kill();
    cameraLoopTimeline = null;
  }

  cam.active = true;
  applyCameraFromState();
  const introBridgeHold = 1.2;
  const bridgeFadeDuration = 4;
  const crossFadeOverlap = bridgeFadeDuration;
  const staticSideFadeOffset = 6.0;
  const staticSideFadeDuration = 2.0;
  const flipRestartOffset = 10.0;
  const cubesFadeInDuration = 8.0;
  const cubesFadeOutDuration = 6.0;
  const bridgeFadeEase = 'none';
  const bridgeFadeStart = introBridgeHold;
  const bridgeFadeEnd = bridgeFadeStart + bridgeFadeDuration;
  const revealStart = Math.max(bridgeFadeStart, bridgeFadeEnd - crossFadeOverlap);
  const cameraMoveStart = bridgeFadeEnd * 0.5;
  const cameraPreAngle = 0.18;
  const cameraPreRadius = 40;
  const cameraPreHeight = 20;
  const cameraZoomStart = cameraMoveStart + 8; // Start immediately after camera movement ends
  const cameraZoomDuration = 15;
  const cubesFadeOutStart = cameraMoveStart;
  const bridgeStartOpacity = 1.0;
  const flipThinStart = cameraZoomStart + cameraZoomDuration;
  const flipThinDuration = 2;
  const flipFadeOutDuration = 1.5;
  const flipFadeOutStart = flipThinStart + flipThinDuration - 4;
  const returnStart = flipFadeOutStart + flipFadeOutDuration;
  const returnDuration = 4.0;
  const cycleEnd = returnStart + returnDuration;
  const _tlAspect = document.querySelector('.aspect-btn.active')?.dataset?.aspect;
  const _isNarrow = (_tlAspect === '9:16' || _tlAspect === '1:1');
  const videoStartTime = _isNarrow ? 8 : 10; // portrait/square model starts 1 unit closer → 2s less travel
  const bridgeFade = { opacity: bridgeStartOpacity };
  resetLoopSceneState(bridgeStartOpacity);
  cameraLoopTimeline = gsap.timeline({
    repeat: -1,
    defaults: { overwrite: 'auto' },
    onRepeat: () => {
      bridgeFade.opacity = bridgeStartOpacity;
      resetLoopSceneState(bridgeStartOpacity);
    },
  })
    .call(() => restartDimensionFrameTimeline(), [], 0)
    .call(() => showStaticSideFaces(), [], 0)
    .call(() => startRunwayModel(), [], 8)   // model appears at t=8s
    .call(() => startRunwayVideo(), [], videoStartTime)  // video start adjusted per aspect ratio
    .call(() => startRunwayGhost(), [], returnStart) // ghost + markers appear when camera returns
    .call(() => { setFlipGridOpacity(1); flipGridFade.opacity = 1; if (flipGrid) flipGrid.visible = true; }, [], returnStart)
    .call(() => resetFlipCascadeState(true), [], flipRestartOffset)
    .call(() => fadeOutStaticSideFaces(staticSideFadeDuration), [], cameraMoveStart + staticSideFadeOffset)
    // Reset #text-unbroken to its initial state so stale GSAP values don't persist between restarts
    .set('#text-unbroken', {
      opacity: 0.15,
      scale: 1,
    }, 0)
    .to(cam, {
      angle: cameraLoopStart.angle,
      radius: cameraLoopStart.radius,
      height: cameraLoopStart.height,
      fov: cameraLoopStart.fov,
      duration: 0,
    }, 0)
    .to(cam.target, {
      y: CameraTargetY,
      duration: 0,
    }, 0)
    .to(cubes?.material ?? {}, {
      opacity: 0,
      duration: 0,
    }, 0)
    .to(extraCubesFade, {
      opacity: 0,
      duration: 0,
      onUpdate: () => setExtraCubesOpacity(extraCubesFade.opacity),
    }, 0)
    .to(secondFourDState, {
      opacity: 0,
      duration: 0,
      onUpdate: () => {
        if (secondFourDMesh && !secondFourDRevealed) {
          secondFourDMesh.visible = false;
          forEachObjectMaterial(secondFourDMesh, (mat) => { mat.opacity = 0; });
        }
      },
    }, 0)
    .to(bridgeFade, {
      opacity: 0,
      duration: bridgeFadeDuration,
      ease: bridgeFadeEase,
      onUpdate: () => setFourDMeshOpacity(bridgeFade.opacity),
    }, bridgeFadeStart)
    .to(cam, {
      angle: 0, radius: 1, height: 0,
      duration: 8, ease: 'sine.inOut',
    }, cameraMoveStart)
    .to(cam.target, {
      y: ThreeDPosition[1],
      duration: 4,
      ease: 'sine.inOut',
    }, cameraMoveStart)
    .to('#text-unbroken', {
      scale: (() => {
        const a = document.querySelector('.aspect-btn.active')?.dataset?.aspect;
        return (a === '1:1') ? 0.65 : 0.65;
      })(),
      duration: 4,
      ease: 'sine.inOut',
    }, cameraMoveStart + 3)
    .to('#text-unbroken', {
      opacity: (() => {
        const a = document.querySelector('.aspect-btn.active')?.dataset?.aspect;
        return (a === '9:16') ? 0.8 : 0.75;
      })(),
      duration: 4,
      ease: 'sine.inOut',
    }, flipRestartOffset)
    .to(cubes?.material ?? {}, {
      opacity: 1, duration: cubesFadeInDuration, ease: 'power2.out', overwrite: false,
    }, revealStart)
    .to(extraCubesFade, {
      opacity: 1, duration: cubesFadeInDuration, ease: 'power2.out', overwrite: false,
      onUpdate: () => setExtraCubesOpacity(extraCubesFade.opacity),
    }, revealStart)
    .to(cubes?.material ?? {}, {
      opacity: 0,
      duration: cubesFadeOutDuration , // todo
      ease: 'power1.inOut',
      overwrite: false,
    }, cubesFadeOutStart + 2)
    .to(extraCubesFade, {
      opacity: 0,
      duration: cubesFadeOutDuration,
      ease: 'power1.inOut',
      overwrite: false,
      onUpdate: () => setExtraCubesOpacity(extraCubesFade.opacity),
    }, cubesFadeOutStart + 2)
    .call(() => {
      if (reservedCube?.material?.color) {
        gsap.to(reservedCube.material.color, { r: 0.6, g: 0.1, b: 0.1, duration: 5, ease: 'sine.inOut' });
      }
      if (flipGrid?.material?.uniforms?.monoDark) {
        gsap.to(flipGrid.material.uniforms.monoDark.value, { r: 0.35, g: 0.04, b: 0.04, duration: 5, ease: 'sine.inOut' });
      }
      if (flipGrid?.material?.uniforms?.monoLight) {
        gsap.to(flipGrid.material.uniforms.monoLight.value, { r: 0.75, g: 0.28, b: 0.28, duration: 5, ease: 'sine.inOut' });
      }
      flipStaticSideFaces.forEach(face => {
        if (face.material?.uniforms?.monoDark) {
          gsap.to(face.material.uniforms.monoDark.value, { r: 0.35, g: 0.04, b: 0.04, duration: 5, ease: 'sine.inOut' });
        }
        if (face.material?.uniforms?.monoLight) {
          gsap.to(face.material.uniforms.monoLight.value, { r: 0.75, g: 0.28, b: 0.28, duration: 5, ease: 'sine.inOut' });
        }
      });
      // Ankle markers are always red — no tween needed
    }, [], cameraMoveStart + 1)
    .call(() => {
      // Fade flip colors back from red to palette colors
      const targetDark  = new THREE.Color(blueMono.monoDark);
      const targetLight = new THREE.Color(blueMono.monoLight);
      const dur = returnDuration * 0.7;
      const ease = 'sine.inOut';
      if (flipGrid?.material?.uniforms?.monoDark) {
        gsap.to(flipGrid.material.uniforms.monoDark.value, { r: targetDark.r, g: targetDark.g, b: targetDark.b, duration: dur, ease });
      }
      if (flipGrid?.material?.uniforms?.monoLight) {
        gsap.to(flipGrid.material.uniforms.monoLight.value, { r: targetLight.r, g: targetLight.g, b: targetLight.b, duration: dur, ease });
      }
      flipStaticSideFaces.forEach(face => {
        if (face.material?.uniforms?.monoDark) {
          gsap.to(face.material.uniforms.monoDark.value, { r: targetDark.r, g: targetDark.g, b: targetDark.b, duration: dur, ease });
        }
        if (face.material?.uniforms?.monoLight) {
          gsap.to(face.material.uniforms.monoLight.value, { r: targetLight.r, g: targetLight.g, b: targetLight.b, duration: dur, ease });
        }
      });
    }, [], returnStart)
    .to(reservedCube?.material ?? {}, {
      opacity: 0,
      duration: 0.8,
      ease: 'power1.out',
    }, cameraMoveStart + 6)
    .to(cam, {
      radius: 0.45,
      duration: cameraZoomDuration,
      ease: 'power1.out',
    }, cameraZoomStart)
    .to(flipTileDepthState, {
      value: flipTileDepthEnd,
      duration: flipThinDuration,
      ease: 'power1.out',
      onUpdate: () => applyFlipGridDepth(flipTileDepthState.value),
    }, flipThinStart - 6)
    .to(flipGridFade, {
      opacity: 0,
      duration: flipFadeOutDuration,
      ease: 'power1.out',
      onUpdate: () => setFlipGridOpacity(flipGridFade.opacity),
      onComplete: () => {
        if (flipGrid) flipGrid.visible = false;
      },
    }, flipFadeOutStart)
    .to(wireframeFade, {
      opacity: 0,
      duration: flipFadeOutDuration,
      ease: 'power1.out',
      onUpdate: () => wireframeMaterials.forEach(m => { m.opacity = wireframeFade.opacity; }),
    }, flipFadeOutStart)
    .to(wireframeFade, {
      opacity: 1,
      duration: returnDuration,
      ease: 'sine.inOut',
      onUpdate: () => wireframeMaterials.forEach(m => { m.opacity = wireframeFade.opacity; }),
    }, returnStart)
    .to(flipCenterRowLine?.material ?? {}, {
      opacity: 0,
      duration: flipFadeOutDuration,
      ease: 'power1.out',
      onComplete: () => {
        if (flipCenterRowLine) flipCenterRowLine.visible = false;
      },
    }, flipFadeOutStart)
    // Gradually move toward ~85mm full-frame equivalent (vertical FOV ~16deg).
    .to(cam, {
      fov: 16,
      duration: cameraZoomDuration,
      ease: 'power1.out',
    }, cameraZoomStart)
    .to(cam.target, {
      y: CameraTargetY,
      duration: returnDuration * 0.8,
      ease: 'sine.inOut',
    }, returnStart)
    .to(bridgeFade, {
      opacity: bridgeStartOpacity,
      duration: returnDuration * 0.8,
      ease: 'sine.inOut',
      onUpdate: () => setFourDMeshOpacity(bridgeFade.opacity),
      onStart: () => {
        if (FourDMesh) FourDMesh.visible = true;
      },
    }, returnStart + 0.2)
    .to(reservedCube?.material ?? {}, {
      opacity: 1,
      duration: returnDuration * 0.5,
      ease: 'sine.inOut',
    }, returnStart)
    .to(flipTileDepthState, {
      value: flipTileDepthStart,
      duration: returnDuration * 0.6,
      ease: 'sine.inOut',
      onUpdate: () => applyFlipGridDepth(flipTileDepthState.value),
    }, returnStart)
    .to(flipGrid?.material?.uniforms?.uOpacity ?? {}, {
      value: 0,
      duration: returnDuration * 0.45,
      ease: 'sine.inOut',
      onUpdate: () => {
        if (flipGrid?.material?.uniforms?.uOpacity) {
          setFlipGridOpacity(flipGrid.material.uniforms.uOpacity.value);
        }
      },
    }, returnStart)
    .to(secondFourDState, {
      opacity: 1,
      duration: 1.5,
      ease: 'power2.out',
      onStart: () => {
        if (secondFourDMesh) secondFourDMesh.visible = true;
      },
      onUpdate: () => {
        if (secondFourDMesh) forEachObjectMaterial(secondFourDMesh, (mat) => { mat.opacity = secondFourDState.opacity; });
      },
      onComplete: () => {
        secondFourDRevealed = true;
      },
    }, returnStart - 1.5)
    .to(cam, {
      angle: cameraLoopStart.angle,
      radius: cameraLoopStart.radius,
      height: cameraLoopStart.height,
      duration: returnDuration,
      ease: 'sine.inOut',
    }, returnStart)
    .to(cam, {
      fov: cameraLoopStart.fov,
      duration: returnDuration * 0.7,
      ease: 'sine.inOut',
    }, returnStart)
    .to('#text-unbroken', {
      opacity: 0.2,
      scale: 1,
      duration: returnDuration * 0.7,
      ease: 'sine.inOut',
    }, returnStart)
    .to({}, {
      duration: 0.01,
    }, cycleEnd)
    ;

  syncTimelineControls(true);
}

// ─────────────────────────────────────────────
// 3-D RUNWAY HUMAN
// ─────────────────────────────────────────────

function startRunwayModel() {
  if (!state.threeDScene?.model) return;

  // Adjust startZ per active aspect ratio – closer to cube for portrait/square
  const _activeAspect = document.querySelector('.aspect-btn.active')?.dataset?.aspect;
  const _startZOffset = (_activeAspect === '9:16' || _activeAspect === '1:1') ? -1 : -2;
  state.threeDScene.startZ = ThreeDPosition[2] + _startZOffset;
  if (state.threeDScene2) {
    state.threeDScene2.startZ = state.threeDScene.startZ - 3;
  }

  const { model, action, fadeState } = state.threeDScene;
  
  state.threeDScene.isFadingOut = false;
  state.threeDScene.walkZ = state.threeDScene.startZ; // reset walk position
  state.sc2EverAppeared = true; // marker2 + connector always show when model1 walks
  fadeState.opacity = 0;
  fadeState.fadingOut = false;
  setObjectOpacity(model, 0);

  // Always reset position so model walks from startZ
  model.position.set(
    state.threeDScene.laneX ?? ThreeDPosition[0] + -0.1,
    state.threeDScene.laneY ?? ThreeDPosition[1] + 3,
    state.threeDScene.startZ
  );
  model.visible = true;

  // Start video playback
  // (video is started separately via startRunwayVideo at a later timeline offset)

  if (action) {
    action.reset().play();
  }

  gsap.killTweensOf(fadeState);
  gsap.to(fadeState, {
    opacity: 1,
    duration: 0.8,
    ease: 'power2.out',
    onUpdate: () => {
      const op = fadeState.opacity;
      model.traverse(child => {
        if ((child.isMesh || child.isSkinnedMesh) && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => { m.transparent = true; m.depthWrite = false; m.opacity = op; m.needsUpdate = true; });
        }
      });
    },
  });

  // (ghost model + markers are started separately via startRunwayGhost() at returnStart)
}

function startRunwayGhost() {
  // Show ankle marker 1 (hidden by resetLoopSceneState between loops)
  if (state.ankleMarker1) state.ankleMarker1.visible = true;
  // Start ghost model (marker2 + connector are already shown by startRunwayModel)
  if (runwayGhostTrailEnabled && state.threeDScene2?.model) {
    const sc2 = state.threeDScene2;
    sc2.isFadingOut = false;
    sc2.walkZ = sc2.startZ;
    sc2.fadeState.opacity = 0;
    sc2.fadeState.targetOpacity = 0.4;
    sc2.fadeState.fadingIn = true;
    sc2.fadeState.fadingOut = false;
    sc2.fadeState.fadeInStart = performance.now();
    sc2.fadeState.fadeInDuration = 800; // ms
    sc2.model.traverse(child => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.transparent = true; m.depthWrite = false; m.opacity = 0; m.needsUpdate = true; });
      }
    });
    sc2.model.position.set(sc2.laneX, sc2.laneY, sc2.startZ);
    sc2.model.visible = true;
    if (sc2.action) sc2.action.reset().play();
  }
}

function startRunwayVideo() {
  if (!flipConfig.video) return;
  flipConfig.video.currentTime = 0;
  flipConfig.video.play().catch(() => {});
}

function loadRunwayHuman3D(url) {

  // Use a standalone loader (no manager) so LoadingManager lifecycle doesn't interfere
  new FBXLoader().load(url, (object) => {
    const model = object;
    normalizeModel(model, 0.6); // must match scene scale
    // Place at camera target so it's guaranteed in frame
    model.position.set(ThreeDPosition[0] , ThreeDPosition[1], ThreeDPosition[2]); // -X pushes further from camera; adjust value
    // Face +Z so gait direction matches right-to-left runway translation.
    model.rotation.set(Math.PI, Math.PI, Math.PI);
    forEachObjectMaterial(model, (material) => {
      material.flatShading = true;
      if ('map' in material && material.map) material.map = null;
      if ('color' in material && material.color) material.color.setHex(blueMono.modelRunway ?? blueMono.model);
      if ('emissive' in material && material.emissive) material.emissive.setHex(blueMono.emissiveModel);
      material.transparent = true; // required for opacity fade
      material.depthWrite = false;
      material.opacity = 0;
      material.needsUpdate = true;
    });
    model.visible = false; // startRunwayModel will make it visible with fade-in
    scene.add(model);
    // console.log('FBX loaded and added to scene', model);

    const mixer = new THREE.AnimationMixer(model);
    let action = null;
    if (object.animations.length) {
      action = mixer.clipAction(object.animations[0]);
      action.loop = THREE.LoopRepeat;
    }

    state.threeDScene = {
      mixer,
      model,
      action,
      walkSpeed: 0.5, // units per second
      startZ: ThreeDPosition[2] - 2, // start screen-right, move toward screen-left
      endZ: ThreeDPosition[2] - 0.4, // fade out earlier (lower = sooner)
      laneX: ThreeDPosition[0] - 0.5, // fixed X lane
      laneY: ThreeDPosition[1] - 0.3, // fixed model Y height (use ankleDebug.laneY for marker offset only)
      isFadingOut: false,
      fadeState: { opacity: 0 },
    };

    // ── Second model (walks behind model1, connected by ankle line) ──
    const model2 = model.clone();
    // Deep-clone materials so model2 opacity is fully independent from model1
    model2.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => m.clone());
        } else {
          child.material = child.material.clone();
        }
      }
    });
    model2.rotation.set(Math.PI, Math.PI, Math.PI);
    model2.visible = false;
    forEachObjectMaterial(model2, (mat) => {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = 0;
      mat.needsUpdate = true;
    });
    scene.add(model2);

    const mixer2 = new THREE.AnimationMixer(model2);
    let action2 = null;
    if (object.animations.length) {
      action2 = mixer2.clipAction(object.animations[0]);
      action2.loop = THREE.LoopRepeat;
    }
    const sc1 = state.threeDScene;
    state.threeDScene2 = {
      mixer: mixer2, model: model2, action: action2,
      walkSpeed: sc1.walkSpeed,
      startZ: sc1.startZ - 3,
      endZ: sc1.endZ,
      laneX: sc1.laneX,
      laneY: sc1.laneY,
      isFadingOut: false,
      fadeState: { opacity: 0 },
      walkZ: sc1.startZ - 3,
    };

    // ── Ankle wireframe markers ──
    const _edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.4, 0.15, 0.4));
    const ankleGeo = new LineSegmentsGeometry().fromEdgesGeometry(_edgesGeo);
    const ankleMat = new LineMaterial({
      color: 0xe62626,
      linewidth: 0.8,          // pixels
      worldUnits: false,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
    });

    state.ankleMarker1 = new LineSegments2(ankleGeo, ankleMat.clone());
    state.ankleMarker1.visible = true;
    scene.add(state.ankleMarker1);

    // Mirror on opposite X side (reflected around ThreeDPosition[0])
    state.ankleMarker2 = new LineSegments2(ankleGeo, ankleMat.clone());
    state.ankleMarker2.visible = true;
    scene.add(state.ankleMarker2);

    const connPositions = new Float32Array(6);
    const connGeo = new THREE.BufferGeometry();
    connGeo.setAttribute('position', new THREE.BufferAttribute(connPositions, 3));
    state.ankleConnector = new THREE.Line(connGeo, new THREE.LineBasicMaterial({ color: 0xe62626, linewidth: 2 }));
    state.ankleConnector.frustumCulled = false;
    state.ankleConnector.visible = true;
    scene.add(state.ankleConnector);


  },
  undefined,
  (err) => console.error('FBX load error:', err));
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
  animateCameraToCube();
  clock.start();
  renderLoop();
}

function renderLoop() {
  rafId = requestAnimationFrame(renderLoop);
  const delta = clock.getDelta();

  // Keep video texture fresh if playing.
  if (flipConfig.video) {
    if (flipVideoTexture && flipConfig.video.readyState >= flipConfig.video.HAVE_CURRENT_DATA && !flipConfig.video.paused) {
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
    // Re-apply our world position AFTER mixer update to override any root motion in the FBX
    if (state.threeDScene.model?.visible) {
      const sc = state.threeDScene;
      sc.model.position.set(sc.laneX ?? ThreeDPosition[0], sc.laneY ?? ThreeDPosition[1], sc.walkZ ?? sc.startZ);
    }
    if (state.threeDScene.model?.visible && state.threeDScene.action && !state.threeDScene.action.isRunning()) {
      state.threeDScene.action.play();
    }
  }
  if (state.twoDScene?.mixer) {
    state.twoDScene.mixer.update(delta);
  }
  if (runwayGhostTrailEnabled && state.threeDScene2?.mixer) {
    state.threeDScene2.mixer.update(delta);
    if (state.threeDScene2.model?.visible) {
      const sc2 = state.threeDScene2;
      sc2.model.position.set(sc2.laneX, sc2.laneY, sc2.walkZ ?? sc2.startZ);
    }
  }

  // ── Move 3D runway model forward while walking ──
  if (state.threeDScene?.model && state.threeDScene.model.visible) {
    const sc = state.threeDScene;
    const endZ = sc.endZ ?? 0;

    if (sc.walkZ === undefined) sc.walkZ = sc.startZ;

    // Keep runway translation running during fade-out so the model does not
    // look like it is "walking in place" while opacity drops.
    sc.walkZ += sc.walkSpeed * delta;
    if (!sc.isFadingOut && sc.walkZ >= endZ) {
      sc.isFadingOut = true;
      sc.fadeState.fadingOut = true;
      sc.fadeState.fadeOutStart = performance.now();
      sc.fadeState.fadeOutFrom = sc.fadeState.opacity;
      sc.fadeState.fadeOutDuration = 900; // ms
    }

    // Drive fade-out manually every frame
    if (sc.fadeState.fadingOut) {
      const elapsed = performance.now() - sc.fadeState.fadeOutStart;
      const t = Math.min(1, elapsed / sc.fadeState.fadeOutDuration);
      sc.fadeState.opacity = sc.fadeState.fadeOutFrom * (1 - t);
      if (t >= 1) {
        sc.fadeState.fadingOut = false;
        sc.fadeState.opacity = 0;
        setObjectOpacity(sc.model, 0);
        sc.model.visible = false;
        sc.isFadingOut = false;
        if (sc.action) sc.action.stop();
      }
    }

    // Force opacity every frame via direct traverse
    const targetOp1 = sc.fadeState.opacity;
    sc.model.traverse(child => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.transparent = true; m.depthWrite = false; m.opacity = targetOp1; m.needsUpdate = true; });
      }
    });

  }

  // ── Move model2 forward ──
  if (runwayGhostTrailEnabled && state.threeDScene2?.model && state.threeDScene2.model.visible) {
    const sc2 = state.threeDScene2;
    const endZ2 = sc2.endZ ?? 0;
    if (sc2.walkZ === undefined) sc2.walkZ = sc2.startZ;

    // Keep motion during fade-out for the same reason as model1.
    sc2.walkZ += sc2.walkSpeed * delta;
    if (!sc2.isFadingOut && sc2.walkZ >= endZ2) {
      sc2.isFadingOut = true;
      sc2.fadeState.fadingIn = false;
      sc2.fadeState.fadingOut = true;
      sc2.fadeState.fadeOutStart = performance.now();
      sc2.fadeState.fadeOutFrom = sc2.fadeState.opacity;
      sc2.fadeState.fadeOutDuration = 900; // ms
    }

    // Drive fade-in manually (no GSAP) so opacity is guaranteed correct
    if (sc2.fadeState.fadingIn) {
      const elapsed = performance.now() - sc2.fadeState.fadeInStart;
      const t = Math.min(1, elapsed / sc2.fadeState.fadeInDuration);
      sc2.fadeState.opacity = t * sc2.fadeState.targetOpacity;
      if (t >= 1) sc2.fadeState.fadingIn = false;
    } else if (sc2.fadeState.fadingOut) {
      const elapsed = performance.now() - sc2.fadeState.fadeOutStart;
      const t = Math.min(1, elapsed / sc2.fadeState.fadeOutDuration);
      sc2.fadeState.opacity = sc2.fadeState.fadeOutFrom * (1 - t);
      if (t >= 1) {
        sc2.fadeState.fadingOut = false;
        sc2.fadeState.opacity = 0;
        setObjectOpacity(sc2.model, 0);
        sc2.model.visible = false;
        sc2.isFadingOut = false;
        if (sc2.action) sc2.action.stop();
      }
    }
    // Force opacity every frame via direct traverse
    const targetOp = sc2.fadeState.opacity;
    sc2.model.traverse(child => {
      if ((child.isMesh || child.isSkinnedMesh) && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { m.transparent = true; m.depthWrite = false; m.opacity = targetOp; m.needsUpdate = true; });
      }
    });
  }

  // ── Ankle markers + connector ──
  if (state.ankleMarker1) {
    const sc = state.threeDScene;
    if (sc) {
      // Markers are fixed in world space — they do not track the walking model
      const z = ThreeDPosition[2] + ankleDebug.laneZOffset;
      const z2 = ThreeDPosition[2] + ankleDebug.marker2ZOffset;
      const y = ankleDebug.laneY + ankleDebug.dy; // use ankleDebug.laneY directly, independent of model position
      const mirrorX = 2 * ThreeDPosition[0] - sc.laneX;
      const m1x = sc.laneX + ankleDebug.marker1XOffset;
      state.ankleMarker1.position.set(m1x, y, z);
      state.ankleMarker1.scale.setScalar(ankleDebug.markerScale);
      // visible is controlled by startRunwayGhost / resetLoopSceneState; don't force it here

      const y2 = y + ankleDebug.marker2YOffset;
      state.ankleMarker1.visible = true;
      if (state.ankleMarker2) {
        state.ankleMarker2.position.set(mirrorX + ankleDebug.marker2XOffset, y2, z2);
        state.ankleMarker2.scale.setScalar(ankleDebug.markerScale);
        state.ankleMarker2.visible = true;
      }

      if (state.ankleConnector) {
        const pos = state.ankleConnector.geometry.attributes.position.array;
        pos[0] = m1x;                                   pos[1] = y;  pos[2] = z;
        pos[3] = mirrorX + ankleDebug.marker2XOffset;  pos[4] = y2; pos[5] = z2;
        state.ankleConnector.geometry.attributes.position.needsUpdate = true;
        state.ankleConnector.visible = true;
      }
    }
  }


  // ── WebGL flip grid animation ──
  if (flipGrid && flipGrid.visible && flipData && flipState.isAnimating) {
    flipState.elapsed += delta;
    const totalDuration = flipData.totalDuration || ((Math.max(...flipData.delays)) + (Math.PI / 2) / flipState.speed);
    flipState.spacingProgress = Math.min(1, flipState.elapsed / totalDuration);

    const count = flipData.angles.length;

    // Update each tile's rotation angle
    for (let i = 0; i < count; i++) {
      const timeIntoFlip = flipState.elapsed - flipData.delays[i];
      if (timeIntoFlip > 0) {
        flipData.angles[i] = Math.min(Math.PI / 2, timeIntoFlip * flipState.speed);
      }
    }
    updateFlipGridInstanceMatrices();

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
  if (controls.enabled) {
    controls.update();
  }
  syncTimelineControls();

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

// Exposed so the HTML script can drive resizes (aspect-ratio mode + free window resize)
window.resizeScene = function(w, h) {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const res = new THREE.Vector2(w, h);
  [state.ankleMarker1, state.ankleMarker2].forEach(m => {
    if (m?.material) m.material.resolution.copy(res);
  });
};

// Restart everything from t=0 (called on palette change, aspect-ratio toggle, etc.)
window.restartAnimation = function() {
  initDimensionFrameOverlay();
  animateCameraToCube();
};

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

initTimelineControls();
boot();

// ─────────────────────────────────────────────
// DEBUG GUI
// ─────────────────────────────────────────────
// (function initDebugGUI() {
//   const gui = new GUI({ title: 'Debug', width: 240 });
//   gui.domElement.style.position = 'fixed';
//   gui.domElement.style.top = '1rem';
//   gui.domElement.style.right = '1rem';
//   gui.domElement.style.zIndex = '200';

//   const ankle = gui.addFolder('Ankle Marker');
//   ankle.add(ankleDebug, 'dy', -30, 5, 0.1).name('Y offset (dy)').onChange(() => {
//     // live — render loop picks it up automatically
//   });
//   ankle.add(ankleDebug, 'laneY', 0, 50, 0.05).name('Marker 1 Y pos').onChange(() => {
//     // live — render loop reads ankleDebug.laneY directly for ankle marker position
//   });
//   ankle.add(ankleDebug, 'laneX', -5, 5, 0.05).name('Model laneX offset').onChange(v => {
//     const x = ThreeDPosition[0] - v;
//     if (state.threeDScene)  state.threeDScene.laneX  = x;
//     if (state.threeDScene2) state.threeDScene2.laneX = x;
//   });
//   ankle.add(ankleDebug, 'laneZOffset', -20, 20, 0.5).name('Marker 1 Z offset');
//   ankle.add(ankleDebug, 'markerScale', 0.1, 20, 0.1).name('Marker scale');
//   ankle.add(ankleDebug, 'marker1XOffset', -50, 50, 0.1).name('Marker 1 X offset');
//   ankle.add(ankleDebug, 'marker2XOffset', -50, 50, 0.1).name('Marker 2 X offset');
//   ankle.add(ankleDebug, 'marker2YOffset', -30, 30, 0.1).name('Marker 2 Y offset');
//   ankle.add(ankleDebug, 'marker2ZOffset', -20, 20, 0.5).name('Marker 2 Z offset');
//   ankle.open();

//   // Log current values to console for copy-paste into code
//   gui.add({ log() {
//     console.log('ankleDebug snapshot:', JSON.stringify(ankleDebug));
//     const sc = state.threeDScene;
//     if (sc) console.log('threeDScene laneX:', sc.laneX, 'laneY:', sc.laneY);
//   }}, 'log').name('📋 Log values to console');
// })();
