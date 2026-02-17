import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import gsap from "gsap";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// States
let ThreeDScene = null;
let TwoDScene = null;


// Loading Manger
const loadingOverlay = document.getElementById("loading");

const manager = new THREE.LoadingManager();

manager.onStart = () => {
  loadingOverlay.style.display = "flex";
};

manager.onLoad = () => {
  loadingOverlay.style.display = "none";

  // Only start rendering AFTER everything is ready
  animate();
};

manager.onProgress = (url, loaded, total) => {
  loadingOverlay.innerText = `Loading ${Math.round((loaded / total) * 100)}%`;
};

manager.onError = (url) => {
  console.error("Error loading:", url);
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// For 2D Scene
let renderTarget;
let screenScene;
let orthoCamera;
renderTarget = new THREE.WebGLRenderTarget(128, 128);
renderTarget.texture.minFilter = THREE.NearestFilter;
renderTarget.texture.magFilter = THREE.NearestFilter;
renderTarget.texture.generateMipmaps = false;

orthoCamera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
orthoCamera.position.z = 2;
orthoCamera.lookAt(0,0,0);

screenScene = new THREE.Scene();

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);

screenScene.add(plane);


// Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(5, 5, 5);

// Renderer setup with shadow support
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Controls setup
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Add ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

// Add directional light with shadows
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;

// Configure shadow properties
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;

scene.add(directionalLight);

// Optional: Add a second light for better illumination
const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
fillLight.position.set(-10, 10, -10);
scene.add(fillLight);

// Create grid wireframe with line spacing equal to bounding box Y size
function createGridWireframe(boundingBox, rows = 4, cols = 4) {
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  
  const vertices = [];
  const lineSpacing = size.x; // Distance between lines = Y dimension of bounding box
  
  // Create horizontal lines (along X axis) - spaced by lineSpacing in Y
  for (let z = boundingBox.min.z; z <= boundingBox.max.z; z += size.z / 8) { // divide by num of lines you want
    for (let y = boundingBox.min.y; y <= boundingBox.max.y; y += lineSpacing) {
        // Front face
        vertices.push(
            boundingBox.min.x, y, z,
            boundingBox.max.x, y, z
        );
    }
    }
  
  // Create vertical lines (along Y axis) - spaced by lineSpacing in X
  for (let z = boundingBox.min.z; z <= boundingBox.max.z; z += size.z / 8) { // divide by num of lines you want
    for (let x = boundingBox.min.x; x <= boundingBox.max.x; x += lineSpacing) {
        // Front face
        vertices.push(
        x, boundingBox.min.y, z,
        x, boundingBox.max.y, z
        );
    }
    }
    
  // Create depth lines (along Z axis) at grid intersections
  for (let y = boundingBox.min.y; y <= boundingBox.max.y; y += lineSpacing / 1) {
    for (let x = boundingBox.min.x; x <= boundingBox.max.x; x += lineSpacing) {
      vertices.push(
        x, y, boundingBox.min.z,
        x, y, boundingBox.max.z
      );
    }
  }

  // GRID on the floor
//   const numOfRows = 20;
//   const numOfCols = 8;
//   // Rows
//     for (let x = boundingBox.min.x; x <= boundingBox.max.x * numOfRows; x += lineSpacing) {
//       vertices.push(
//         x - size.x * numOfRows / 4, boundingBox.min.y, boundingBox.min.z,
//         x - size.x * numOfRows / 4, boundingBox.min.y, boundingBox.max.z
//       );
//     }
//     // Cols
//     for (let z = boundingBox.min.z; z <= boundingBox.max.z; z += lineSpacing) {
//       vertices.push(
//         size.x, boundingBox.min.y, z - size.x * numOfCols,
//         size.x * numOfRows, boundingBox.min.y, z - size.x * numOfCols
//       );
//     }
  
  // Create single geometry with all line segments
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lineSegments = new THREE.LineSegments(geometry, lineMaterial);
  
  scene.add(lineSegments);
  return lineSegments;
}

let cubes = null;
let reservedCube = null;
let instanceData = null;
const tempObject = new THREE.Object3D();
const clock = new THREE.Clock();

// Load point cloud
const fileLoader = new THREE.FileLoader(manager);

fileLoader.load(
  "pointcloud.json",
  (text) => {
    const data = JSON.parse(text);
    const geometry = new THREE.BufferGeometry();

    const positions = [];

    data.points.forEach(point => {
      positions.push(point[0], point[1], point[2]);
    });

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );

    // Center the geometry
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);

    const centeredPositions = [];
    for (let i = 0; i < positions.length; i += 3) {
      centeredPositions.push(
        positions[i] - center.x,
        positions[i + 1] - center.y,
        positions[i + 2] - center.z
      );
    }

    const cubeSize = 0.4;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.3,
      opacity: 1,
      transparent: true
    });
    material.depthWrite = false;
    material.depthTest = true;
    material.transparent = true;
    material.needsUpdate = true;

    cubes = new THREE.InstancedMesh(
      cubeGeometry,
      material,
      centeredPositions.length / 3
    );

    cubes.castShadow = true;
    cubes.receiveShadow = true;

    const instanceCount = centeredPositions.length / 3;

    instanceData = {
    positions: centeredPositions,
    rotations: new Float32Array(instanceCount * 3),
    speeds: new Float32Array(instanceCount * 3)
    };

    for (let i = 0; i < centeredPositions.length; i += 3) {
      const idx = i / 3;
      const rIndex = idx * 3;

      tempObject.position.set(
        centeredPositions[i],
        centeredPositions[i + 1],
        centeredPositions[i + 2]
      );
      tempObject.rotation.set(0, 0, 0);
      tempObject.updateMatrix();
      cubes.setMatrixAt(idx, tempObject.matrix);

      instanceData.rotations[rIndex] = 0;
      instanceData.rotations[rIndex + 1] = 0;
      instanceData.rotations[rIndex + 2] = 0;

      instanceData.speeds[rIndex] = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
      instanceData.speeds[rIndex + 1] = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
      instanceData.speeds[rIndex + 2] = (Math.random() * 0.3 + 0.05) * (Math.random() < 0.5 ? -1 : 1);
    }

    cubes.rotation.x = -Math.PI / 2;
    scene.add(cubes);


    // ---- RESERVED CENTER CUBE ----
    const reservedGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);

    const reservedMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.8,
    emissive: 0xffffff,
    emissiveIntensity: 0.2
    });

    reservedCube = new THREE.Mesh(reservedGeometry, reservedMaterial);
    reservedCube.material = new THREE.MeshBasicMaterial({
        map: renderTarget.texture
    });

    reservedCube.position.set(0, -2, 0); // guaranteed center
    reservedCube.rotation.copy(cubes.rotation);

    reservedCube.castShadow = true;
    reservedCube.receiveShadow = true;

    scene.add(reservedCube);

    const box3 = new THREE.Box3().setFromObject(cubes);
    
    // create point cloud for the walking model
    createRunwayPointHuman({
        scene,
        url: "public/walking-model.fbx",
        mode: "none", // try: "points" or "cubes"
        pointCount: 1200
    });

    createPixelRunwayHuman({
        url: "public/walking-model2.fbx"
    });

    // Create grid wireframe with 10 rows and 10 columns (change these numbers as needed)
    createGridWireframe(box3, 4, 4);

    const size = new THREE.Vector3();
    box3.getSize(size);

    directionalLight.shadow.camera.left = box3.min.x - 10;
    directionalLight.shadow.camera.right = box3.max.x + 10;
    directionalLight.shadow.camera.top = box3.max.y + 10;
    directionalLight.shadow.camera.bottom = box3.min.y - 10;
    directionalLight.shadow.camera.updateProjectionMatrix();

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov / 2));
    cameraZ *= 0.2;
    
    // camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    // controls.update();

    document.getElementById('loading').style.display = 'none';

    console.log(`Loaded ${data.points.length} cubes`);
    console.log(`Bounding box size:`, size);
    
    // Start camera animation after everything is loaded
    animateCameraToCube();
  })
  .catch(error => {
    console.error('Error loading point cloud:', error);
    document.getElementById('loading').textContent = 'Error loading point cloud';
  });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  }
);


function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (cubes && instanceData) {
    const { positions, rotations, speeds } = instanceData;
    for (let i = 0; i < positions.length; i += 3) {
      const idx = i / 3;
      const rIndex = idx * 3;

      rotations[rIndex] += speeds[rIndex] * delta;
      rotations[rIndex + 1] += speeds[rIndex + 1] * delta;
      rotations[rIndex + 2] += speeds[rIndex + 2] * delta;

      tempObject.position.set(
        positions[i],
        positions[i + 1],
        positions[i + 2]
      );
      tempObject.rotation.set(
        rotations[rIndex],
        rotations[rIndex + 1],
        rotations[rIndex + 2]
      );
      tempObject.updateMatrix();
      cubes.setMatrixAt(idx, tempObject.matrix);
    }
    cubes.instanceMatrix.needsUpdate = true;
  }

  if (TwoDScene?.mixer)
        TwoDScene.mixer.update(delta);

  if (ThreeDScene?.mixer) {

    const data = ThreeDScene;

    // Always update animation
    if (data.mixer) {
        data.mixer.update(delta);
    }

    // Only run voxel logic if it exists
    if (data.skinnedMesh) {

        data.skinnedMesh.updateMatrixWorld(true);

        const positionAttr = data.skinnedMesh.geometry.attributes.position;

        for (let i = 0; i < data.sampledIndices.length; i++) {

        const index = data.sampledIndices[i];

        tempVertex.fromBufferAttribute(positionAttr, index);
        data.skinnedMesh.boneTransform(index, skinnedVertex);
        skinnedVertex.applyMatrix4(data.skinnedMesh.matrixWorld);

        data.positions[i * 3] = skinnedVertex.x;
        data.positions[i * 3 + 1] = skinnedVertex.y;
        data.positions[i * 3 + 2] = skinnedVertex.z;

        if (data.cubeMesh) {
            tempObject.position.copy(skinnedVertex);
            tempObject.updateMatrix();
            data.cubeMesh.setMatrixAt(i, tempObject.matrix);
        }
        }

        if (data.pointCloud) {
        data.pointCloud.geometry.attributes.position.needsUpdate = true;
        }

        if (data.cubeMesh) {
        data.cubeMesh.instanceMatrix.needsUpdate = true;
        }
    }
    }

    // 2D Scene
    // add the model to the scene
    // 1. Render screenScene into texture
    renderer.setRenderTarget(renderTarget);
    renderer.render(screenScene, orthoCamera);
    renderer.setRenderTarget(null);

//   controls.update();
  renderer.render(scene, camera);
}

function animateCameraToCube() {

  controls.enabled = false;

  const duration = 6;
  const endRadius = 1;
  const target = reservedCube.position.clone();

  const startOffset = camera.position.clone().sub(target);
//   const startRadius = startOffset.length();
const startRadius = 40;
const startHeight = 20;

  // Force clean axis-aligned start around the target
  camera.position.set(target.x + startRadius, target.y + startHeight, target.z);
  camera.lookAt(target);

  const state = {
    angle: 0,
    radius: startRadius,
    height: startHeight
  };

  const tl = gsap.timeline({
    onComplete: () => {
    //   controls.enabled = true;
    }
  });

  // ---- SPIRAL (1.75 rotations) ----
  tl.to(state, {
    angle: Math.PI, // 1.75 rotations
    radius: endRadius,
    height: 0,
    duration: duration,
    ease: "power2.inOut",
    onUpdate: () => {

      const x = Math.cos(state.angle) * state.radius;
      const z = Math.sin(state.angle) * state.radius;

      camera.position.set(target.x + x, target.y + state.height, target.z + z);
      camera.lookAt(target);
    }
  });

  // transition other cubes to be invisible 
  tl.to(cubes.material, {
    opacity: 0.01,
    duration: duration,
    ease: "power2.inOut"
  }, 0)

}

function createRunwayPointHuman({
  scene,
  url,
  mode = "points", // "none" | "points" | "cubes" | "both"
  pointCount = 1200,
  cubeSize = 0.05,
}) {

  const loader = new FBXLoader(manager);

  loader.load(url, (object) => {

    const model = object;
    scene.add(model);

    // -----------------------------
    // SCALE + CENTER MODEL
    // -----------------------------
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetHeight = 1; // adjust this to control human height
    const scaleFactor = targetHeight / size.y;
    model.scale.setScalar(scaleFactor);

    // Fix upside down (ONLY if needed)
    model.rotation.x = Math.PI;

    // Recalculate box after scaling
    box.setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);

    model.position.sub(center);
    model.position.set(0, -2.5, 2);
    model.rotation.set(Math.PI, 0, Math.PI); // world correction

    // screenScene.add(model);

    // -----------------------------
    // FIND SKINNED MESH
    // -----------------------------
    let skinnedMesh = null;
    model.traverse((child) => {
      if (child.isSkinnedMesh) skinnedMesh = child;
    });

    // -----------------------------
    // ANIMATION MIXER
    // -----------------------------
    const mixer = new THREE.AnimationMixer(model);
    if (object.animations && object.animations.length > 0) {
      object.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }

    // If mode is NONE → only animate original mesh
    if (mode === "none") {
      // -----------------------------
        // ANIMATION MIXER
        // -----------------------------
        const mixer = new THREE.AnimationMixer(model);
        let action = null;

        if (object.animations && object.animations.length > 0) {
        action = mixer.clipAction(object.animations[0]);
        action.loop = THREE.LoopOnce;
        action.clampWhenFinished = true;
        }

        // Make invisible initially
        model.visible = false;

        // -----------------------------
        // DELAY LOGIC
        // -----------------------------

        gsap.delayedCall(3, () => {

        model.visible = true;

        if (action) {
            action.reset();
            action.play();
        }

        // Remove after 2 seconds
        gsap.delayedCall(2, () => {

            scene.remove(model);

            if (action) action.stop();

        });

        });

        // Store mixer WITHOUT overwriting anything else
        // if (!window.mixers) window.mixers = [];
        // window.mixers.push(mixer);


      ThreeDScene = { mixer };
      return;
    }

    if (!skinnedMesh) {
      console.error("No skinned mesh found.");
      ThreeDScene = { mixer };
      return;
    }

    // -----------------------------
    // PRESELECT VERTICES ONCE
    // -----------------------------
    const vertexCount = skinnedMesh.geometry.attributes.position.count;
    const sampledIndices = new Uint32Array(pointCount);

    for (let i = 0; i < pointCount; i++) {
      sampledIndices[i] = Math.floor(Math.random() * vertexCount);
    }

    const positions = new Float32Array(pointCount * 3);

    // -----------------------------
    // POINT CLOUD
    // -----------------------------
    let pointCloud = null;

    if (mode === "points" || mode === "both") {

      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );

      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.02
      });

      pointCloud = new THREE.Points(geo, mat);
      scene.add(pointCloud);
    }

    // -----------------------------
    // CUBE MODE
    // -----------------------------
    let cubeMesh = null;

    if (mode === "cubes" || mode === "both") {

      const cubeGeo = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
      const cubeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.2
      });

      cubeMesh = new THREE.InstancedMesh(
        cubeGeo,
        cubeMat,
        pointCount
      );

      scene.add(cubeMesh);
    }

    // -----------------------------
    // STORE EVERYTHING FOR animate()
    // -----------------------------
    ThreeDScene = {
      mixer,
      skinnedMesh,
      sampledIndices,
      positions,
      cubeMesh,
      pointCloud
    };

  });
}

function createPixelRunwayHuman({ url }) {

  const loader = new FBXLoader(manager);

  loader.load(url, (object) => {

    const model = object;
    screenScene.add(model);

    normalizeModel(model);

    // -----------------------------
    // ANIMATION MIXER
    // -----------------------------
    const mixer = new THREE.AnimationMixer(model);
    let action = null;

    if (object.animations && object.animations.length > 0) {
      action = mixer.clipAction(object.animations[0]);
      action.loop = THREE.LoopOnce;
      action.clampWhenFinished = true;
    }

    // Make invisible initially
    model.visible = false;

    // -----------------------------
    // DELAY LOGIC
    // -----------------------------
    gsap.delayedCall(4.5, () => {
          ThreeDScene?.mixer?.stopAllAction();

      model.visible = true;

      if (action) {
        action.reset();
        action.play();
      }

      // Get animation duration and remove after it completes
      if (action) {
        const animDuration = action.getClip().duration;
        gsap.delayedCall(animDuration, () => {
          screenScene.remove(model);
          if (action) action.stop();
        });
      }
    });

    // Store mixer
    if (!window.mixers) window.mixers = [];
    window.mixers.push(mixer);

    TwoDScene = {
      model,
      mixer
    };

  });

  // Create Grid to visualize how the 2D Scene is pixelated
  addPixelGrid(32);
}

function addPixelGrid(resolution = 32) {

  const size = 2;
  const step = size / resolution;

  const vertices = [];

  for (let i = -1; i <= 1; i += step) {

    // vertical
    vertices.push(i, -1, 0.01);
    vertices.push(i,  1, 0.01);

    // horizontal
    vertices.push(-1, i, 0.01);
    vertices.push( 1, i, 0.01);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  const material = new THREE.LineBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 1   // makes them visually thinner
  });

  const grid = new THREE.LineSegments(geometry, material);
  screenScene.add(grid);
}

function normalizeModel(model) {

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const scaleFactor = 1 / size.y;
  model.scale.setScalar(scaleFactor);

  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // 2D model position & rotation
  model.position.sub(center);
  model.position.set(0, -1.5, 0);
// model.rotation.set(0, 0, 0); // reset fully first

    model.rotation.x = -Math.PI/2; // world correction
    model.rotation.z = -Math.PI/2;
}


manager.onLoad = () => {
    animate()
};
