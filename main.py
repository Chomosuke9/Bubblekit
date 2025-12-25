#!/usr/bin/env python3
"""
Dev convenience launcher that starts the FastAPI backend (uvicorn) and the Vite
frontend with a single command:

    python main.py --reload --host 0.0.0.0 --port 8000

By default it runs both servers; disable the frontend with --no-frontend.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional


ROOT = Path(__file__).resolve().parent
SERVER_DIR = ROOT / "apps" / "server"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Bubblekit backend (uvicorn) and frontend (Vite) together."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Backend host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Backend port (default: 8000)")
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn reload for backend when code changes.",
    )
    parser.add_argument(
        "--backend-app",
        default="apps.server.main:app",
        help="Uvicorn app import path (default: apps.server.main:app)",
    )
    parser.add_argument(
        "--backend-factory",
        action="store_true",
        help="Treat backend app as a factory (uvicorn --factory).",
    )
    parser.add_argument(
        "--frontend-port",
        type=int,
        default=5173,
        help="Frontend (Vite) port (default: 5173)",
    )
    parser.add_argument(
        "--frontend-host",
        default=None,
        help="Frontend host (default: backend host).",
    )
    parser.add_argument(
        "--no-frontend",
        action="store_true",
        help="Skip starting the frontend dev server.",
    )
    return parser.parse_args()


def start_backend(args: argparse.Namespace) -> subprocess.Popen:
    env = os.environ.copy()
    # Ensure in-repo bubblekit imports resolve without installation.
    pythonpath = env.get("PYTHONPATH", "")
    server_path = str(SERVER_DIR)
    if server_path not in pythonpath.split(os.pathsep):
        env["PYTHONPATH"] = os.pathsep.join(filter(None, [server_path, pythonpath]))

    cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        args.backend_app,
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    if args.reload:
        cmd.append("--reload")
    if args.backend_factory:
        cmd.append("--factory")

    print(f"[backend] starting: {' '.join(cmd)}")
    return subprocess.Popen(cmd, cwd=ROOT, env=env)


def start_frontend(args: argparse.Namespace) -> Optional[subprocess.Popen]:
    if args.no_frontend:
        print("[frontend] skipped (--no-frontend)")
        return None

    if shutil.which("npm") is None:
        print("[frontend] npm not found on PATH; skipping frontend.", file=sys.stderr)
        return None

    frontend_host = args.frontend_host or args.host
    env = os.environ.copy()
    env.setdefault("VITE_API_BASE_URL", f"http://{args.host}:{args.port}")

    cmd = [
        "npm",
        "--workspace",
        "apps/web",
        "run",
        "dev",
        "--",
        "--host",
        frontend_host,
        "--port",
        str(args.frontend_port),
    ]

    print(f"[frontend] starting: {' '.join(cmd)}")
    # Use repo root so the workspace script resolves to apps/web.
    return subprocess.Popen(cmd, cwd=ROOT, env=env)


def main() -> None:
    args = parse_args()

    processes: List[Dict[str, subprocess.Popen]] = []
    backend_proc = start_backend(args)
    processes.append({"name": "backend", "proc": backend_proc})

    frontend_proc = start_frontend(args)
    if frontend_proc is not None:
        processes.append({"name": "frontend", "proc": frontend_proc})

    try:
        while processes:
            for entry in list(processes):
                proc = entry["proc"]
                retcode = proc.poll()
                if retcode is None:
                    continue
                print(f"[{entry['name']}] exited with code {retcode}")
                processes.remove(entry)
            time.sleep(0.3)
    except KeyboardInterrupt:
        print("\n[runner] shutting down...")
    finally:
        for entry in processes:
            proc = entry["proc"]
            if proc.poll() is None:
                proc.terminate()
        # Give processes a moment to exit cleanly.
        time.sleep(0.5)
        for entry in processes:
            proc = entry["proc"]
            if proc.poll() is None:
                proc.kill()


if __name__ == "__main__":
    main()
