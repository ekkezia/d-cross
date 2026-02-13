import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

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

// REMOVED: ground plane that was intersecting the mesh

// Create pixelated texture grid from image using InstancedMesh for performance
function createPixelatedGrid(texturePath, gridCols, gridRows, gridSize = 10, position = { x: 0, y: 10, z: 0 }) {
  const loader = new THREE.TextureLoader();
  
  loader.load(texturePath, (texture) => {
    const image = texture.image;
    
    // Create a canvas to read pixel data
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    
    const squareSize = gridSize / gridCols;
    const instanceCount = gridCols * gridRows;
    
    // Create single shared geometry and material
    const planeGeometry = new THREE.PlaneGeometry(squareSize, squareSize);
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    
    // Create instanced mesh for all squares
    const instancedMesh = new THREE.InstancedMesh(planeGeometry, material, instanceCount);
    
    // Calculate pixel dimensions for each grid cell
    const pixelWidth = image.width / gridCols;
    const pixelHeight = image.height / gridRows;
    
    const tempObject = new THREE.Object3D();
    const tempColor = new THREE.Color();
    
    let idx = 0;
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        // Sample the center pixel of this grid cell
        const pixelX = Math.floor(col * pixelWidth + pixelWidth / 2);
        const pixelY = Math.floor(row * pixelHeight + pixelHeight / 2);
        
        // Get the pixel color
        const imageData = ctx.getImageData(pixelX, pixelY, 1, 1);
        const [r, g, b] = imageData.data;
        
        // Position each square
        const x = (col - gridCols / 2) * squareSize + squareSize / 2;
        const y = (gridRows / 2 - row) * squareSize - squareSize / 2;
        
        tempObject.position.set(x, y, 0);
        tempObject.updateMatrix();
        instancedMesh.setMatrixAt(idx, tempObject.matrix);
        
        // Set per-instance color
        tempColor.setRGB(r / 255, g / 255, b / 255);
        instancedMesh.setColorAt(idx, tempColor);
        
        idx++;
      }
    }
    
    // Position the grid in the scene
    instancedMesh.position.set(position.x, position.y, position.z);
    scene.add(instancedMesh);
    
    console.log(`Created ${gridCols}x${gridRows} pixelated grid (${instanceCount} instances)`);
  }, undefined, (error) => {
    console.error('Error loading texture:', error);
  });
}

// Create grid wireframe with n rows and columns (optimized single geometry)
function createGridWireframe(boundingBox, rows = 10, cols = 10) {
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  
  const vertices = [];
  
  // Create horizontal lines (along X axis)
//   for (let i = 0; i <= rows; i++) {
//     const y = boundingBox.min.y + (size.y / rows) * i;
//     // Front face
//     vertices.push(
//       boundingBox.min.x, y, boundingBox.min.z,
//       boundingBox.max.x, y, boundingBox.min.z
//     );
//     // Back face
//     vertices.push(
//       boundingBox.min.x, y, boundingBox.max.z,
//       boundingBox.max.x, y, boundingBox.max.z
//     );
//   }
  
  // Create vertical lines (along Y axis)
  for (let i = 0; i <= cols; i++) {
    const x = boundingBox.min.x + (size.x / cols) * i;
    // Front face
    // vertices.push(
    //   x, boundingBox.min.y, boundingBox.min.z,
    //   x, boundingBox.max.y, boundingBox.min.z
    // );
    // Back face
    // vertices.push(
    //   x, boundingBox.min.y, boundingBox.max.z,
    //   x, boundingBox.max.y, boundingBox.max.z
    // );
  }
  
  // Create depth lines (along Z axis) at grid intersections
  for (let i = 0; i <= 1; i++) {
    for (let j = 0; j <= cols; j++) {
      const x = boundingBox.min.x + (size.x / cols) * j;
      const y = boundingBox.min.y + (size.y / rows) * i;
      vertices.push(
        x, y, boundingBox.min.z,
        x, y, boundingBox.max.z
      );
    }
  }
  
  // Create single geometry with all line segments
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lineSegments = new THREE.LineSegments(geometry, lineMaterial);
  
  scene.add(lineSegments);
  return lineSegments;
}

// Create pixelated grid from the meme image
createPixelatedGrid('public/texture.png', 64, 64, 20, { x: 30, y: 10, z: 0 });

let cubes = null;
let instanceData = null;
const tempObject = new THREE.Object3D();
const clock = new THREE.Clock();

// Load point cloud
fetch('pointcloud.json')
  .then(res => res.json())
  .then(data => {
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
      metalness: 0.3
    });
    
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

    const box3 = new THREE.Box3().setFromObject(cubes);
    
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
    cameraZ *= 2;
    
    camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.lookAt(0, 0, 0);
    controls.update();

    document.getElementById('loading').style.display = 'none';

    console.log(`Loaded ${data.points.length} cubes`);
    console.log(`Bounding box size:`, size);
  })
  .catch(error => {
    console.error('Error loading point cloud:', error);
    document.getElementById('loading').textContent = 'Error loading point cloud';
  });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

  controls.update();
  renderer.render(scene, camera);
}

animate();