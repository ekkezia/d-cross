import argparse
import json
import math

import trimesh


def load_single_mesh(path: str) -> trimesh.Trimesh:
    scene_or_mesh = trimesh.load(path)
    if isinstance(scene_or_mesh, trimesh.Scene):
        meshes = [
            geom for geom in scene_or_mesh.geometry.values()
            if isinstance(geom, trimesh.Trimesh)
        ]
        if not meshes:
            raise ValueError(f"No mesh geometry found in scene: {path}")
        return trimesh.util.concatenate(meshes)
    if isinstance(scene_or_mesh, trimesh.Trimesh):
        return scene_or_mesh
    raise ValueError(f"Unsupported geometry type from {path}: {type(scene_or_mesh)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert mesh to sampled point cloud JSON.")
    parser.add_argument("--input", default="public/3d-model-human.glb", help="Input mesh path (GLB/GLTF/OBJ/FBX-supported by trimesh).")
    parser.add_argument("--output", default="public/pointcloud-human.json", help="Output JSON path.")
    parser.add_argument("--num-points", type=int, default=10000, help="Number of surface sample points.")
    parser.add_argument("--scale", type=float, default=1.0, help="Uniform scale applied before sampling.")
    parser.add_argument("--rot-x-deg", type=float, default=0.0, help="Rotation X in degrees.")
    parser.add_argument("--rot-y-deg", type=float, default=0.0, help="Rotation Y in degrees.")
    parser.add_argument("--rot-z-deg", type=float, default=0.0, help="Rotation Z in degrees.")
    args = parser.parse_args()

    mesh = load_single_mesh(args.input)

    if args.scale != 1.0:
        mesh.apply_scale(args.scale)

    rx = math.radians(args.rot_x_deg)
    ry = math.radians(args.rot_y_deg)
    rz = math.radians(args.rot_z_deg)
    rotation = trimesh.transformations.euler_matrix(rx, ry, rz, "sxyz")
    mesh.apply_transform(rotation)

    points, face_indices = trimesh.sample.sample_surface(mesh, args.num_points)

    point_cloud = {
        "points": points.tolist(),
        "count": len(points),
    }

    if hasattr(mesh.visual, "vertex_colors") and mesh.visual.vertex_colors is not None:
        colors = mesh.visual.vertex_colors[mesh.faces[face_indices]]
        point_cloud["colors"] = colors.tolist()

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(point_cloud, f)

    print(
        f"Generated point cloud with {len(points)} points from {args.input} "
        f"(scale={args.scale}, rot=({args.rot_x_deg},{args.rot_y_deg},{args.rot_z_deg}))"
    )


if __name__ == "__main__":
    main()
