"""Local-only browser QA host. Production GitHub Pages remains HTTPS and unchanged.

The app's production CSP upgrades HTTP to HTTPS. For local 127.0.0.1-only
tests, remove *only* that directive so WebKit can load same-origin modules
and workers over the deliberately local test server.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class LocalTestHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/WarrantyEase/", "/WarrantyEase/index.html"):
            original = Path("WarrantyEase/index.html").read_bytes()
            if b"upgrade-insecure-requests" not in original:
                raise RuntimeError("Expected production HTTPS-only CSP not found")
            html = original.replace(b"; upgrade-insecure-requests", b"")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(html)
            return
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8822), LocalTestHandler)
    print("Warranty Ease local HTTP OCR test server ready", flush=True)
    server.serve_forever()
