#!/usr/bin/env python3
"""Tiny history-sync API for Home Trainer (gym.recat.in).

Stdlib only, listens on 127.0.0.1:8091 behind nginx.
  POST /api/history  append one workout entry (deduped by `date`)
  GET  /api/history  return all entries as a JSON array

Data lives in /opt/home-trainer-data/history.jsonl — one JSON object per
line, OUTSIDE the repo checkout so `git pull` deploys never touch it.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from http.cookies import SimpleCookie
import hmac
import json
import os
import time

DATA_DIR = '/opt/home-trainer-data'
FILE = os.path.join(DATA_DIR, 'history.jsonl')
PIN_FILE = os.path.join(DATA_DIR, 'pin.txt')  # created by setup-gym.sh, chmod 600
MAX_BODY = 200_000

# global brute-force throttle: 30 failed PIN attempts per hour, then 429s.
# Single legitimate user -> a lockout only ever inconveniences an attacker.
_fail = {'count': 0, 'window': 0.0}


def _throttled():
    now = time.time()
    if now - _fail['window'] > 3600:
        _fail.update(count=0, window=now)
    return _fail['count'] >= 30


def _stored_pin():
    try:
        with open(PIN_FILE) as f:  # read per-request so rotating the file just works
            return f.read().strip()
    except FileNotFoundError:
        return ''  # fail closed: no PIN file, no access


def _supplied_pin(handler):
    """PIN from the X-Gym-Pin header or the gympin cookie (set by /api/login)."""
    header = handler.headers.get('X-Gym-Pin', '')
    if header:
        return header
    cookie = SimpleCookie(handler.headers.get('Cookie', ''))
    return cookie['gympin'].value if 'gympin' in cookie else ''


def _pin_valid(supplied):
    pin = _stored_pin()
    return bool(pin) and hmac.compare_digest(supplied, pin)


def entries():
    if not os.path.exists(FILE):
        return []
    with open(FILE) as f:
        return [json.loads(line) for line in f if line.strip()]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, code, obj, extra_headers=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _auth(self):
        """A valid PIN always passes (never throttled). An absent PIN is a
        plain 401 that does NOT count as a failure — every logged-out page
        visit hits /api/auth and must not be able to lock the real user out.
        Only actual wrong guesses feed the throttle."""
        supplied = _supplied_pin(self)
        if _pin_valid(supplied):
            return True
        if not supplied:
            self._send(401, {'error': 'pin required'})
            return False
        if _throttled():
            self._send(429, {'error': 'too many attempts, try later'})
            return False
        _fail['count'] += 1
        time.sleep(0.5)
        self._send(401, {'error': 'wrong pin'})
        return False

    def do_GET(self):
        path = self.path.split('?')[0].rstrip('/')
        if path == '/api/auth':
            # nginx auth_request gate: 200 lets the original request through
            if self._auth():
                self._send(200, {'ok': True})
            return
        if path == '/api/history':
            if not self._auth():
                return
            return self._send(200, entries())
        self._send(404, {'error': 'not found'})

    def _do_login(self):
        n = int(self.headers.get('Content-Length', 0))
        if n <= 0 or n > 1000:
            return self._send(400, {'error': 'bad size'})
        try:
            pin = str(json.loads(self.rfile.read(n)).get('pin', '')).strip()
        except (ValueError, json.JSONDecodeError, AttributeError):
            return self._send(400, {'error': 'invalid request'})
        if not pin:
            return self._send(401, {'error': 'pin required'})
        if _throttled():
            return self._send(429, {'error': 'too many attempts, try later'})
        if not _pin_valid(pin):
            _fail['count'] += 1
            time.sleep(0.5)
            return self._send(401, {'error': 'wrong pin'})
        # ~180 days; HttpOnly so page JS never sees it, Secure for HTTPS-only
        cookie = f'gympin={pin}; Max-Age=15552000; Path=/; HttpOnly; Secure; SameSite=Lax'
        self._send(200, {'ok': True}, {'Set-Cookie': cookie})

    def do_POST(self):
        path = self.path.split('?')[0].rstrip('/')
        if path == '/api/login':
            return self._do_login()
        if path != '/api/history':
            return self._send(404, {'error': 'not found'})
        if not self._auth():
            return
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
