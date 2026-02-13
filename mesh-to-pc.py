import trimesh
import json
import numpy as np

# Load the GLB file
scene = trimesh.load('model.glb')

# Check if it's a Scene and extract geometry
if isinstance(scene, trimesh.Scene):
    # Combine all meshes in the scene into one
    mesh = trimesh.util.concatenate(
        [geom for geom in scene.geometry.values() 
         if isinstance(geom, trimesh.Trimesh)]
    )
else:
    mesh = scene

# Sample points from the mesh surface
num_points = 10000
points, face_indices = trimesh.sample.sample_surface(mesh, num_points)

# Optional: get colors if mesh has vertex colors
colors = None
if hasattr(mesh.visual, 'vertex_colors'):
    colors = mesh.visual.vertex_colors[mesh.faces[face_indices]]

# Convert to JSON format
point_cloud = {
    "points": points.tolist(),
    "count": len(points)
}

if colors is not None:
    point_cloud["colors"] = colors.tolist()

# Save to JSON
with open('pointcloud.json', 'w') as f:
    json.dump(point_cloud, f, indent=2)

print(f"Generated point cloud with {len(points)} points")