#!/usr/bin/env python3
"""Local dev server that disables caching entirely — plain `python -m http.server`
sends no Cache-Control headers, so browsers apply heuristic caching and can keep
serving stale JS/CSS after an edit. Not used in production (GitHub Pages sets its
own proper caching headers); this is dev-only, to make local testing reliable."""

import http.server
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))  # always serve this script's own folder


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    http.server.test(HandlerClass=NoCacheHandler, port=port)
