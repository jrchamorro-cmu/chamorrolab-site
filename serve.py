#!/usr/bin/env python3
"""Local preview server for docs/ with HTTP Range support, so <video> plays
and seeks the way it does on GitHub Pages.  Usage: python3 serve.py [port]"""
import os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")

class RangeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.translate_path(self.path)
        rng = self.headers.get("Range")
        if os.path.isdir(path) or not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)$", rng)
        size = os.path.getsize(path)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        if m.group(1) == "":
            start, end = size - int(m.group(2)), size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(source, outputfile)
        while n > 0:
            chunk = source.read(min(65536, n))
            if not chunk:
                break
            outputfile.write(chunk)
            n -= len(chunk)

    def end_headers(self):
        if "Cache-Control" not in self._headers_buffer_text():
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _headers_buffer_text(self):
        return b"".join(self._headers_buffer).decode("latin-1") if hasattr(self, "_headers_buffer") else ""

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"serving {ROOT} at http://localhost:{port}/")
    ThreadingHTTPServer(("127.0.0.1", port), RangeHandler).serve_forever()
