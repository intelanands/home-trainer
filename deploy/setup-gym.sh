#!/usr/bin/env bash
# One-time setup: host Home Trainer at gym.recat.in from the ERP server.
# Run on the server (or: ssh administrator@192.168.1.13 'bash -s' < deploy/setup-gym.sh)
# Idempotent — safe to re-run after any change to nginx/API/tunnel config.
set -euo pipefail

echo '=== 1/5 Clone (or update) the app ==='
if [ ! -d /opt/home-trainer ]; then
  sudo mkdir -p /opt/home-trainer
  sudo chown administrator:administrator /opt/home-trainer
  git clone https://github.com/intelanands/home-trainer.git /opt/home-trainer
else
  git -C /opt/home-trainer pull
fi

echo '=== 2/5 History API service (must be up BEFORE nginx: auth_request depends on it) ==='
sudo mkdir -p /opt/home-trainer-data
sudo chown administrator:administrator /opt/home-trainer-data
if [ ! -f /opt/home-trainer-data/pin.txt ]; then
  # no pipes here: `tr </dev/urandom | head` dies of SIGPIPE under pipefail
  printf '%06d' "$(( ($(od -An -N4 -tu4 /dev/urandom | tr -d ' ')) % 1000000 ))" > /opt/home-trainer-data/pin.txt
  echo "Generated new API PIN (the login page asks for it once per device)."
fi
chmod 600 /opt/home-trainer-data/pin.txt
if [ ! -f /opt/home-trainer-data/session-gen.txt ]; then
  date +%s%N > /opt/home-trainer-data/session-gen.txt
fi
chmod 600 /opt/home-trainer-data/session-gen.txt
sudo cp /opt/home-trainer/deploy/home-trainer-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now home-trainer-api
sudo systemctl restart home-trainer-api  # pick up script changes on redeploys
sleep 1
PIN=$(cat /opt/home-trainer-data/pin.txt)
curl -s -o /dev/null -w 'api without pin (want 401): %{http_code}\n' http://127.0.0.1:8091/api/history
curl -s -o /dev/null -w 'api with pin (want 200): %{http_code}\n' -H "X-Gym-Pin: $PIN" http://127.0.0.1:8091/api/history

echo '=== 3/5 Nginx site (graceful reload, no portal downtime) ==='

# SAFETY (incident, July 2026): this box's nginx serves multiple sites on :80.
# The ERP site uses `server_name _`, which matches NOTHING — it only receives
# traffic as the DEFAULT server. nginx picks the default implicitly as the
# first-loaded block (sites-enabled is read alphabetically, "home-trainer"
# sorts first!), so adding this site once hijacked portal.catapharma.com and
# every other hostname. The ERP site must carry an explicit `default_server`
# flag BEFORE this site is enabled. Verify, don't assume:
if ! grep -qsE 'listen[^;]*default_server' /etc/nginx/sites-enabled/* ; then
  echo 'ABORT: no enabled nginx site has an explicit default_server on :80.'
  echo 'Add it to the ERP site first, e.g. in /etc/nginx/sites-available/tally-connector:'
  echo '    listen 80 default_server;'
  echo 'Otherwise this site becomes the implicit default and hijacks all hostnames.'
  exit 1
fi

sudo tee /etc/nginx/sites-available/home-trainer > /dev/null << 'EOF'
server {
    listen 80;
    server_name gym.recat.in;
    root /opt/home-trainer;
    index index.html;

    # Small app files: no-store — clients and proxies must never keep a copy.
    # (no-cache allowed revalidation-based staleness on some devices; these
    # files are tiny, always fetch fresh.)
    add_header Cache-Control "no-store";

    # LOGIN WALL: every request must carry the gympin cookie; the history API
    # validates it via this auth subrequest. Anything unauthenticated gets
    # the login page instead (served as 200 so browsers render it plainly).
    auth_request /_gym_auth;
    error_page 401 =200 /login.html;

    location = /_gym_auth {
        internal;
        auth_request off;
        proxy_pass http://127.0.0.1:8091/api/auth;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
    }

    # The only public page. X-Gym-Login lets the service worker recognise
    # login content served under other URLs (via error_page) and never cache it.
    location = /login.html {
        auth_request off;
        add_header Cache-Control "no-cache";
        add_header X-Gym-Login "1";
    }

    location = /api/login {
        auth_request off;
        proxy_pass http://127.0.0.1:8091;
        client_max_body_size 10k;
    }

    # Direct session check for the app's launch gate: must answer JSON
    # 200/401 itself, never the error_page login redirect.
    location = /api/auth {
        auth_request off;
        proxy_pass http://127.0.0.1:8091;
    }

    # Self-guards with the PIN; auth_request off keeps its JSON 401s intact
    # (error_page must not rewrite API errors into login HTML).
    location = /api/history {
        auth_request off;
        proxy_pass http://127.0.0.1:8091;
        client_max_body_size 200k;
    }

    # Exercise photos are immutable - cache aggressively
    location /img/exercises/ {
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # Never serve repo internals (.git, .claude)
    location ~ /\. { deny all; }

    location / { try_files $uri $uri/ =404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/home-trainer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sleep 1

# Regression check EVERY co-hosted hostname, not just the new one — the
# July 2026 incident shipped because only gym.recat.in was tested.
check() {  # check <host> <expected_code>
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $1" http://localhost/)
  printf '%-26s -> %s (want %s)\n' "$1" "$code" "$2"
  [ "$code" = "$2" ]
}
check gym.recat.in          200   # login page for the unauthenticated
check portal.catapharma.com 302   # ERP redirects to /login
check unknown.example.com   302   # unmatched hosts must fall to the ERP default, NOT the trainer

# Login-wall checks: no auth -> login page; with PIN -> the app
if curl -s -D - -o /dev/null -H 'Host: gym.recat.in' http://localhost/ | grep -qi 'x-gym-login'; then
  echo 'wall: unauthenticated / serves the login page  OK'
else
  echo 'WALL BROKEN: unauthenticated / did NOT serve the login page'; exit 1
fi
if curl -s -D - -o /dev/null -H 'Host: gym.recat.in' -H "X-Gym-Pin: $PIN" http://localhost/ | grep -qi 'x-gym-login'; then
  echo 'WALL BROKEN: authenticated / still got the login page'; exit 1
else
  echo 'wall: authenticated / serves the app  OK'
fi

echo '=== 4/5 Cloudflare tunnel ingress (brief blip on all tunnel subdomains) ==='
if ! sudo grep -q 'gym\.recat\.in' /etc/cloudflared/config.yml; then
  sudo sed -i 's|^\(\s*\)- service: http_status:404|\1- hostname: gym.recat.in\n\1  service: http://localhost:80\n\1- service: http_status:404|' /etc/cloudflared/config.yml
  sudo systemctl restart cloudflared
  sleep 3
fi
systemctl is-active cloudflared

echo '=== 5/5 DNS check ==='
# DNS is a MANUAL record — the tunnel cert only covers catapharma.com, so
# `cloudflared tunnel route dns` cannot manage the recat.in zone (running it
# anyway creates a junk gym.recat.in.catapharma.com record — don't).
if curl -s --max-time 10 https://gym.recat.in/login.html | grep -q 'Home Trainer'; then
  echo 'gym.recat.in reachable through the tunnel — DNS OK.'
else
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk '/tally-portal/ {print $1}')
  echo '!!! gym.recat.in is not reachable.'
  echo '!!! Add this record in the Cloudflare dashboard, zone recat.in:'
  echo "!!!   Type: CNAME | Name: gym | Target: ${TUNNEL_ID}.cfargotunnel.com | Proxy status: Proxied (orange cloud)"
fi

echo 'DONE'
