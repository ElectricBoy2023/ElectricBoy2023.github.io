#!/usr/bin/env python3
"""WSign self-hosted server scaffold.

This provides the WSign HTTP API and job lifecycle. The actual IPA signing step is
intentionally left as an integration point for an authorized Apple distribution
workflow; do not put signing credentials in the web frontend or repository.
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

HOST = os.environ.get("WSIGN_HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "5690"))
RETENTION_SECONDS = 15 * 60
ROOT = Path(os.environ.get("WSIGN_DATA", "./wsign-data"))
ROOT.mkdir(parents=True, exist_ok=True)
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def json_response(handler, status, data):
    payload = json.dumps(data).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.send_header("Access-Control-Allow-Origin", os.environ.get("WSIGN_CORS", "*"))
    handler.end_headers()
    handler.wfile.write(payload)


def cleanup_loop():
    while True:
        time.sleep(30)
        now = time.time()
        with LOCK:
            expired = [jid for jid, job in JOBS.items() if now - job.get("created", now) > RETENTION_SECONDS]
            for jid in expired:
                job = JOBS.pop(jid, None)
                if job and job.get("directory"):
                    shutil.rmtree(job["directory"], ignore_errors=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "WSignServer/0.1"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", os.environ.get("WSIGN_CORS", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/v1/info":
            return json_response(self, 200, {"name": "WSign", "version": "0.1", "status": "ok"})
        if path.startswith("/api/v1/jobs/"):
            jid = path.rsplit("/", 1)[-1]
            with LOCK:
                job = JOBS.get(jid)
                if not job:
                    return json_response(self, 404, {"error": "job_not_found"})
                public = {k: v for k, v in job.items() if k not in {"directory", "output"}}
            return json_response(self, 200, public)
        if path.startswith("/download/"):
            jid = path.rsplit("/", 1)[-1]
            with LOCK:
                job = JOBS.get(jid)
                output = Path(job["output"]) if job and job.get("output") else None
            if not output or not output.is_file():
                return json_response(self, 404, {"error": "artifact_not_found"})
            data = output.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", f'attachment; filename="{output.name}"')
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", os.environ.get("WSIGN_CORS", "*"))
            self.end_headers()
            self.wfile.write(data)
            return
        json_response(self, 404, {"error": "not_found"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/v1/jobs/"):
            return json_response(self, 404, {"error": "not_found"})
        jid = path.rsplit("/", 1)[-1]
        with LOCK:
            job = JOBS.pop(jid, None)
        if not job:
            return json_response(self, 404, {"error": "job_not_found"})
        shutil.rmtree(job.get("directory", ""), ignore_errors=True)
        return json_response(self, 200, {"status": "discarded"})

    def do_POST(self):
        path = urlparse(self.path).path
        # Multipart parsing is deliberately delegated to a production WSGI/ASGI
        # implementation. This lightweight server returns the API contract while
        # keeping secret handling out of this static GitHub Pages project.
        if path == "/api/v1/certificates/validate":
            return json_response(self, 501, {"error": "signing_backend_not_configured", "message": "Connect an authorized certificate-validation backend."})
        if path == "/api/v1/sign":
            return json_response(self, 501, {"error": "signing_backend_not_configured", "message": "Connect an authorized Apple distribution/signing backend."})
        return json_response(self, 404, {"error": "not_found"})

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


if __name__ == "__main__":
    threading.Thread(target=cleanup_loop, daemon=True).start()
    print(f"WSign Server listening on http://{HOST}:{PORT}")
    print("Signing backend: not configured")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
