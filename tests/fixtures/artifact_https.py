"""Owned HTTPS acquisition fixture; no external services or product domain imports."""
import http.server
import json
import ssl
import sys
import time
from pathlib import Path

root = Path(sys.argv[1])


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_args):
        pass

    def do_GET(self):
        with (root / 'requests.jsonl').open('a') as log:
            log.write(json.dumps({'path': self.path,
                                 'authorization': self.headers.get('Authorization'),
                                 'cookie': self.headers.get('Cookie'),
                                 'proxyAuthorization': self.headers.get('Proxy-Authorization')}) + '\n')
        if self.path == '/slow':
            time.sleep(5)
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', 'https://fixture.invalid/follow')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if self.path == '/status':
            self.send_response(401)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if self.path == '/partial':
            self.send_response(200)
            self.send_header('Content-Length', '100')
            self.end_headers()
            self.wfile.write(b'xxx')
            self.close_connection = True
            return
        if self.path == '/info':
            self.wfile.write(b'HTTP/1.1 103 Early Hints\r\nLink: </test>\r\n\r\n')
        size = int(self.path.rsplit('/', 1)[1]) if self.path.startswith(('/data/', '/chunked/')) else 1
        chunked = self.path.startswith('/chunked/')
        self.send_response(200)
        self.send_header('X-Opaque', '\xe9')
        if self.path == '/headers':
            self.send_header('X-Flood', 'x' * 100000)
        self.send_header('Transfer-Encoding' if chunked else 'Content-Length', 'chunked' if chunked else str(size))
        self.end_headers()
        while size:
            chunk = b'x' * min(size, 65536)
            size -= len(chunk)
            if chunked:
                self.wfile.write(f'{len(chunk):x}\r\n'.encode())
            self.wfile.write(chunk)
            if chunked:
                self.wfile.write(b'\r\n')
        if chunked:
            self.wfile.write(b'0\r\n\r\n')


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
server.daemon_threads = True
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(root / 'cert.pem', root / 'key.pem')
server.socket = context.wrap_socket(server.socket, server_side=True)
(root / 'port').write_text(str(server.server_port))
server.serve_forever(poll_interval=0.05)
