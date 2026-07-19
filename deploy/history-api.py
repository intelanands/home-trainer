#!/usr/bin/env python3
"""Tiny history-sync API for Home Trainer (gym.recat.in).

Stdlib only, listens on 127.0.0.1:8091 behind nginx.
  POST /api/history  append one workout entry (deduped by `date`)
  GET  /api/history  return all entries as a JSON array

Data lives in /opt/home-trainer-data/history.jsonl — one JSON object per
line, OUTSIDE the repo checkout so `git pull` deploys never touch it.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os

DATA_DIR = '/opt/home-trainer-data'
FILE = os.path.join(DATA_DIR, 'history.jsonl')
MAX_BODY = 200_000


def entries():
    if not os.path.exists(FILE):
        return []
    with open(FILE) as f:
        return [json.loads(line) for line in f if line.strip()]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.rstrip('/') == '/api/history':
            return self._send(200, entries())
        self._send(404, {'error': 'not found'})

    def do_POST(self):
        if self.path.rstrip('/') != '/api/history':
            return self._send(404, {'error': 'not found'})
        n = int(self.headers.get('Content-Length', 0))
        if n <= 0 or n > MAX_BODY:
            return self._send(413, {'error': 'bad size'})
        try:
            entry = json.loads(self.rfile.read(n))
            if not (isinstance(entry, dict) and entry.get('date') and entry.get('sessionKey')):
                raise ValueError
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {'error': 'invalid entry'})
        entry.pop('synced', None)
        # dedup: the client retries until it records a success, so a lost
        # response must not create a second copy
        if any(e.get('date') == entry['date'] for e in entries()):
            return self._send(200, {'ok': True, 'dedup': True})
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(FILE, 'a') as f:
            f.write(json.dumps(entry, separators=(',', ':')) + '\n')
        self._send(200, {'ok': True})


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 8091), Handler).serve_forever()
