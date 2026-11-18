"""Local-only HTTPS test server. Same CSP and asset requests as production Pages.
Synthetic test fixtures only; no Firebase secrets or user receipts."""
import http.server
import ssl
import sys

server = http.server.ThreadingHTTPServer(("127.0.0.1", 8822), http.server.SimpleHTTPRequestHandler)
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
tls.load_cert_chain(sys.argv[1], sys.argv[2])
server.socket = tls.wrap_socket(server.socket, server_side=True)
print("Warranty Ease HTTPS test listener ready", flush=True)
server.serve_forever()
