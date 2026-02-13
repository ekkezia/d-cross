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

// Add grid helper
const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
scene.add(gridHelper);

// Add a ground plane to receive shadows
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ 
  color: 0x111111,
  roughness: 0.8,
  metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.1; // Slightly below the grid
ground.receiveShadow = true;
scene.add(ground);

// Create pixelated texture grid
function createPixelatedGrid(texturePath, gridCols, gridRows, gridSize = 10) {
  const loader = new THREE.TextureLoader();
  
  loader.load(texturePath, (texture) => {
    const squareSize = gridSize / gridCols;
    const gridGroup = new THREE.Group();
    
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        // Create a plane for each grid cell
        const planeGeometry = new THREE.PlaneGeometry(squareSize, squareSize);
        
        // Clone the texture for each square
        const squareTexture = texture.clone();
        squareTexture.needsUpdate = true;
        
        // Set UV offset and repeat to show only this section of the texture
        squareTexture.repeat.set(1 / gridCols, 1 / gridRows);
        squareTexture.offset.set(col / gridCols, 1 - (row + 1) / gridRows);
        
        // Disable texture filtering for pixelated effect
        squareTexture.magFilter = THREE.NearestFilter;
        squareTexture.minFilter = THREE.NearestFilter;
        
        const material = new THREE.MeshBasicMaterial({
          map: squareTexture,
          side: THREE.DoubleSide
        });
        
        const square = new THREE.Mesh(planeGeometry, material);
        
        // Position each square
        const x = (col - gridCols / 2) * squareSize + squareSize / 2;
        const y = (row - gridRows / 2) * squareSize + squareSize / 2;
        square.position.set(x, y, 0);
        
        gridGroup.add(square);
      }
    }
    
    // Position the grid in the scene
    gridGroup.position.set(20, 10, 0);
    scene.add(gridGroup);
    
    console.log(`Created ${gridCols}x${gridRows} pixelated grid`);
  }, undefined, (error) => {
    console.error('Error loading texture:', error);
  });
}

// Example usage: create a 16x16 grid with a texture
// Uncomment and provide your texture path
// createPixelatedGrid('your-texture.jpg', 16, 16, 10);

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
    
    // Changed to MeshStandardMaterial for realistic lighting and shadows
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

    // Enable shadow casting and receiving
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

    // Rotate the point cloud back on X axis
    cubes.rotation.x = -Math.PI / 2;
    scene.add(cubes);

    // Get bounding box of the rotated cubes
    const box3 = new THREE.Box3().setFromObject(cubes);
    const size = new THREE.Vector3();
    box3.getSize(size);
    const boxCenter = new THREE.Vector3();
    box3.getCenter(boxCenter);

    // Find the topmost and bottommost Z values (after rotation)
    const topZ = box3.max.z;
    const bottomZ = box3.min.z;

    // Create wireframe box geometry
    const wireframeGeometry = new THREE.BoxGeometry(size.x, size.y, 0.5);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true
    });

    // Top wireframe box
    const topWireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    topWireframe.position.set(boxCenter.x, boxCenter.y, topZ);
    scene.add(topWireframe);

    // Bottom wireframe box
    const bottomWireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true
    });
    const bottomWireframe = new THREE.Mesh(wireframeGeometry, bottomWireframeMaterial);
    bottomWireframe.position.set(boxCenter.x, boxCenter.y, bottomZ);
    scene.add(bottomWireframe);

    // Add connecting lines between corners
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    
    const corners = [
      [box3.min.x, box3.min.y],
      [box3.max.x, box3.min.y],
      [box3.max.x, box3.max.y],
      [box3.min.x, box3.max.y]
    ];

    corners.forEach(([x, y]) => {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, bottomZ),
        new THREE.Vector3(x, y, topZ)
      ]);
      const line = new THREE.Line(lineGeometry, edgesMaterial);
      scene.add(line);
    });

    // Update shadow camera to fit the bounding box
    directionalLight.shadow.camera.left = box3.min.x - 10;
    directionalLight.shadow.camera.right = box3.max.x + 10;
    directionalLight.shadow.camera.top = box3.max.y + 10;
    directionalLight.shadow.camera.bottom = box3.min.y - 10;
    directionalLight.shadow.camera.updateProjectionMatrix();

    // Adjust camera to fit the point cloud
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
    console.log(`Top Z: ${topZ}, Bottom Z: ${bottomZ}`);
  })
  .catch(error => {
    console.error('Error loading point cloud:', error);
    document.getElementById('loading').textContent = 'Error loading point cloud';
  });

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
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