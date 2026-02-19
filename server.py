import argparse
import json
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class AppHandler(SimpleHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/generate-pointcloud":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(content_length) if content_length else b"{}"
            data = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": f"Invalid JSON: {exc}"})
            return

        input_path = str(data.get("input", "public/bridge.glb"))
        output_path = str(data.get("output", "pointcloud.json"))
        num_points = int(data.get("numPoints", 10000))
        scale = float(data.get("scale", 1.0))
        rot_x = float(data.get("rotXDeg", 0.0))
        rot_y = float(data.get("rotYDeg", 0.0))
        rot_z = float(data.get("rotZDeg", 0.0))

        cmd = [
            sys.executable,
            str(ROOT / "mesh-to-pc.py"),
            "--input",
            input_path,
            "--output",
            output_path,
            "--num-points",
            str(num_points),
            "--scale",
            str(scale),
            "--rot-x-deg",
            str(rot_x),
            "--rot-y-deg",
            str(rot_y),
            "--rot-z-deg",
            str(rot_z),
        ]

        result = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            self._send_json(
                500,
                {
                    "ok": False,
                    "error": "pointcloud generation failed",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                },
            )
            return

        self._send_json(
            200,
            {
                "ok": True,
                "output": output_path,
                "stdout": result.stdout,
            },
        )

    def log_message(self, fmt: str, *args) -> None:
        # Keep server logging concise.
        super().log_message(fmt, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local dev server with pointcloud generation API.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Serving on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
