#!/usr/bin/env bash
# One-time setup: host Home Trainer at gym.recat.in from the ERP server.
# Run on the server (or: ssh administrator@192.168.1.13 'bash -s' < deploy/setup-gym.sh)
set -euo pipefail

echo '=== 1/4 Clone (or update) the app ==='
if [ ! -d /opt/home-trainer ]; then
  sudo mkdir -p /opt/home-trainer
  sudo chown administrator:administrator /opt/home-trainer
  git clone https://github.com/intelanands/home-trainer.git /opt/home-trainer
else
  git -C /opt/home-trainer pull
fi

echo '=== 2/4 Nginx site (graceful reload, no portal downtime) ==='

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

    # Small app files: always revalidate so updates apply on next launch
    add_header Cache-Control "no-cache";

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
check gym.recat.in          200   # the trainer (static index)
check portal.catapharma.com 302   # ERP redirects to /login
check unknown.example.com   302   # unmatched hosts must fall to the ERP default, NOT the trainer

echo '=== 3/4 Cloudflare tunnel ingress (brief blip on all tunnel subdomains) ==='
if ! sudo grep -q 'gym\.recat\.in' /etc/cloudflared/config.yml; then
  sudo sed -i 's|^\(\s*\)- service: http_status:404|\1- hostname: gym.recat.in\n\1  service: http://localhost:80\n\1- service: http_status:404|' /etc/cloudflared/config.yml
fi
echo '--- resulting config ---'
sudo cat /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
sleep 3
systemctl is-active cloudflared

echo '=== 4/4 DNS route ==='
if cloudflared tunnel route dns tally-portal gym.recat.in; then
  echo 'DNS route created automatically.'
else
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | awk '/tally-portal/ {print $1}')
  echo ''
  echo '!!! Automatic DNS route failed (tunnel cert likely only covers catapharma.com).'
  echo '!!! Add this record manually in the Cloudflare dashboard, zone recat.in:'
  echo "!!!   Type: CNAME | Name: gym | Target: ${TUNNEL_ID}.cfargotunnel.com | Proxy status: Proxied (orange cloud)"
fi

echo 'DONE'
