"""Serve the WIASE dashboard, the simulator's live JSON and human check-ins (standard library only)."""

import argparse
import json
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

from checkins import CheckinStore
from simulator import (
    DEFAULT_SCENARIO_SECONDS, DEFAULT_START, MAX_SCENARIO_SECONDS, MIN_SCENARIO_SECONDS,
    SCENARIOS, SPEEDS, Simulation, load_calibration,
)

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DEFAULT_CHECKINS = ROOT / "data" / "checkins.json"
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
}
COMMANDS = {
    "/api/speed": {"speed"},
    "/api/scenarios/trigger": {"id", "target", "duration_seconds"},
    "/api/scenarios/clear": {"id", "target"},
    "/api/reset": set(),
}
CHECKIN_COMMANDS = {
    "/api/checkins/reaction": {"astronaut_id", "trials", "duration_ms", "interrupted", "simulated_at"},
    "/api/checkins/survey": {"astronaut_id", "responses", "sleep_hours", "symptoms", "note", "simulated_at"},
}
POST_ROUTES = {**COMMANDS, **CHECKIN_COMMANDS}
QUIET_ROUTES = {"/api/stream", "/api/state", "/api/baselines", "/api/scenarios", "/api/checkins"}


def static_file(route):
    """Resolve a URL path inside web/ and refuse anything that escapes it."""
    relative = "index.html" if route in ("", "/") else route.lstrip("/")
    candidate = (WEB / relative).resolve()
    if WEB.resolve() not in candidate.parents or not candidate.is_file():
        return None, None
    return candidate, CONTENT_TYPES.get(candidate.suffix, "application/octet-stream")


def encode(data):
    return json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")


class LiveFeed:
    def __init__(self, simulation):
        self.sim = simulation
        self.changed = threading.Condition()
        self.stopped = threading.Event()
        self.feed_id = uuid4().hex
        self.sequence = 0
        self.frame = None
        self.publish()
        self.thread = threading.Thread(target=self.tick, name="simulation-clock", daemon=True)

    def publish(self):
        with self.changed:
            self.sequence += 1
            self.frame = {"feed_id": self.feed_id, **self.sim.snapshot(self.sequence)}
            self.changed.notify_all()
            return self.frame

    def tick(self):
        next_tick = time.monotonic() + 1
        while not self.stopped.wait(max(0, next_tick - time.monotonic())):
            with self.changed:
                self.sim.advance(self.sim.speed)
                self.publish()
            next_tick += 1

    def close(self):
        self.stopped.set()
        with self.changed:
            self.changed.notify_all()
        self.thread.join(timeout=2)

    def await_frame(self, sequence):
        with self.changed:
            self.changed.wait_for(lambda: self.sequence != sequence or self.stopped.is_set(), timeout=15)
            return self.frame if self.sequence != sequence and not self.stopped.is_set() else None

    def control(self, route, body):
        with self.changed:
            if route == "/api/speed":
                self.sim.set_speed(body.get("speed"))
            elif route == "/api/scenarios/trigger":
                self.sim.trigger(body.get("id"), body.get("target"), body.get("duration_seconds", DEFAULT_SCENARIO_SECONDS))
            elif route == "/api/scenarios/clear":
                self.sim.clear(body.get("id"), body.get("target"))
            elif route == "/api/reset":
                self.sim.reset()
            return self.publish()


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, feed, allowed_origins, checkins=None):
        super().__init__(address, Handler)
        self.feed = feed
        self.allowed_origins = frozenset(allowed_origins)
        self.checkins = checkins or CheckinStore(DEFAULT_CHECKINS)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "WIASE/1"

    def route(self):
        return urlsplit(self.path).path

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        return (not origin or origin in self.server.allowed_origins
                or origin == "http://" + self.headers.get("Host", ""))

    def headers_for(self, status, content_type=None, length=None):
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Vary", "Origin")
        if self.headers.get("Origin") and self.origin_allowed():
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])

    def send_data(self, content_type, content, status=200):
        self.headers_for(status, content_type, len(content))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, data, status=200):
        self.send_data("application/json; charset=utf-8", encode(data), status)

    def do_GET(self):
        path = self.route()
        if path == "/api/state":
            self.send_json(self.server.feed.frame)
        elif path == "/api/baselines":
            self.send_json(self.server.feed.sim.baselines())
        elif path == "/api/scenarios":
            self.send_json({
                "scenarios": [{"id": id_, **data} for id_, data in SCENARIOS.items()],
                "durations": {"default_seconds": DEFAULT_SCENARIO_SECONDS,
                              "min_seconds": MIN_SCENARIO_SECONDS, "max_seconds": MAX_SCENARIO_SECONDS},
                "speeds": SPEEDS,
            })
        elif path == "/api/stream":
            self.stream()
        elif path == "/api/checkins":
            query = parse_qs(urlsplit(self.path).query)
            astronaut = query.get("astronaut", [None])[0]
            try:
                if astronaut is None:
                    self.send_json(self.server.checkins.export())
                else:
                    self.send_json(self.server.checkins.summary(astronaut))
            except ValueError as error:
                self.send_json({"error": str(error)}, 400)
        elif path.startswith("/api/"):
            self.send_json({"error": "Unknown endpoint."}, 404)
        else:
            file, content_type = static_file(path)
            if file is None:
                self.send_json({"error": "Not found."}, 404)
            else:
                self.send_data(content_type, file.read_bytes())

    def stream(self):
        self.headers_for(200, "text/event-stream; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        sequence = None
        feed = self.server.feed
        try:
            while not feed.stopped.is_set():
                frame = feed.await_frame(sequence)
                if frame is None:
                    self.wfile.write(b": keepalive\n\n")
                else:
                    sequence = frame["sequence"]
                    self.wfile.write(f"id: {sequence}\ndata: ".encode() + encode(frame) + b"\n\n")
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def do_OPTIONS(self):
        if self.route() not in POST_ROUTES:
            self.headers_for(404, length=0)
        elif not self.origin_allowed():
            self.headers_for(403, length=0)
        else:
            self.headers_for(204, length=0)
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        path = self.route()
        self.close_connection = True
        if path not in POST_ROUTES:
            self.send_json({"error": "Unknown endpoint."}, 404)
            return
        if not self.origin_allowed():
            self.send_json({"error": "This dashboard origin is not allowed. See the --allow-origin option."}, 403)
            return
        if self.headers.get_content_type() != "application/json":
            self.send_json({"error": "Send an application/json body."}, 415)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            limit = 65536 if path in CHECKIN_COMMANDS else 8192
            if not 0 < size <= limit:
                raise ValueError(f"JSON body must be between 1 and {limit} bytes.")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Send a JSON object.")
            unknown = body.keys() - POST_ROUTES[path]
            if unknown:
                raise ValueError("Unknown request fields: " + ", ".join(sorted(unknown)))
            if path == "/api/checkins/reaction":
                self.send_json(self.server.checkins.add_reaction(body), 201)
            elif path == "/api/checkins/survey":
                self.send_json(self.server.checkins.add_survey(body), 201)
            else:
                self.send_json(self.server.feed.control(path, body))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.send_json({"error": "Malformed JSON."}, 400)
        except ValueError as error:
            self.send_json({"error": str(error)}, 400)

    def log_request(self, code="-", size="-"):
        route = self.route()
        if route not in QUIET_ROUTES and not route.startswith(("/js/", "/styles/", "/vendor/")):
            super().log_request(code, size)


def parse_start(text):
    try:
        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
        start = datetime.fromisoformat(normalized)
        if start.utcoffset() is None:
            raise ValueError
        return start.astimezone(DEFAULT_START.tzinfo).replace(microsecond=0)
    except (ValueError, OverflowError):
        raise argparse.ArgumentTypeError("Use an ISO 8601 time with a zone, such as 2030-01-01T08:00:00Z.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765, help="Local HTTP port (default 8765).")
    parser.add_argument("--speed", type=int, choices=SPEEDS, default=1, help="Initial clock speed.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for repeatable runs.")
    parser.add_argument("--start", type=parse_start, default=DEFAULT_START, help="Initial simulated ISO 8601 time.")
    parser.add_argument("--allow-origin", action="append", default=[], help="Allow a separate dashboard origin. Repeat as needed.")
    parser.add_argument("--checkins", type=Path, default=DEFAULT_CHECKINS, help="JSON file for human check-ins.")
    args = parser.parse_args()
    simulation = Simulation(load_calibration(), seed=args.seed, start=args.start)
    simulation.set_speed(args.speed)
    feed = LiveFeed(simulation)
    try:
        server = Server(("127.0.0.1", args.port), feed, args.allow_origin, CheckinStore(args.checkins))
    except OSError as error:
        parser.exit(1, f"Could not start the feed on port {args.port}: {error}\n")
    with server:
        feed.thread.start()
        print(f"WIASE dashboard: http://127.0.0.1:{server.server_port}/", flush=True)
        print(f"Live JSON:       http://127.0.0.1:{server.server_port}/api/stream", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            feed.close()


if __name__ == "__main__":
    main()
