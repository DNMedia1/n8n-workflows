#!/usr/bin/env bash
# ============================================================
#  n8n + Caddy Prod-Setup für Hostinger KVM VPS
#  Als root (oder via sudo) auf einem frischen Ubuntu/Debian-VPS ausführen:
#      bash setup.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 1/5  .env prüfen"
if [ ! -f .env ]; then
  echo "FEHLER: .env fehlt."
  echo "    cp .env.example .env && nano .env   (Werte eintragen, dann erneut starten)"
  exit 1
fi
set -a; . ./.env; set +a
: "${N8N_HOST:?N8N_HOST fehlt in .env}"
: "${SLACK_WEBHOOK_URL:?SLACK_WEBHOOK_URL fehlt in .env}"
: "${OPENROUTER_API_KEY:?OPENROUTER_API_KEY fehlt in .env}"
echo "    Host: ${N8N_HOST}"

echo "==> 2/5  Docker installieren (falls nötig)"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    Docker bereits vorhanden: $(docker --version)"
fi

echo "==> 3/5  Firewall-Ports 80/443 öffnen (ufw, falls aktiv)"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp  || true
  ufw allow 443/tcp || true
  ufw allow 22/tcp  || true
  echo "    ufw-Regeln gesetzt."
else
  echo "    ufw nicht aktiv – überspringe. (Hostinger hPanel-Firewall ggf. manuell: 80, 443, 22)"
fi

echo "==> 4/5  Stack starten"
docker compose pull
docker compose up -d

echo "==> 5/5  Status"
sleep 3
docker compose ps
echo
echo "Fertig. HTTPS-Zertifikat kann 30-60s dauern."
echo "  n8n-Editor :  https://${N8N_HOST}"
echo "  Vapi-URL   :  https://${N8N_HOST}/webhook/vapi-call-ended"
echo
echo "Logs ansehen:  docker compose logs -f"
