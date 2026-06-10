#!/usr/bin/env bash
# ============================================================
#  Schickt einen Fake-Vapi "end-of-call-report" an den n8n-Webhook
#  und testet so die ganze Kette: Webhook -> LLM -> Slack.
#
#  Nutzung:
#      ./test-call.sh https://n8n.deine-domain.de
#  oder (liest N8N_HOST aus .env):
#      ./test-call.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${1:-}" ] && [ -f .env ]; then set -a; . ./.env; set +a; fi
BASE="${1:-https://${N8N_HOST:-localhost:5678}}"
URL="${BASE%/}/webhook/vapi-call-ended"

echo "POST -> $URL"
echo
curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test-call-123",
        "customer": { "name": "Max Mustermann" },
        "endedAt": "2026-06-03T12:00:00Z"
      },
      "analysis": { "structuredData": { "role": "Senior Backend Entwickler" } },
      "transcript": "AI: Hallo, danke fuer Ihre Zeit. Erzaehlen Sie kurz von sich.\nUser: Klar. Ich bin seit 6 Jahren Backend-Entwickler, hauptsaechlich Node.js und Postgres. Aktuell bei einer Fintech-Firma, moechte aber wechseln weil ich mehr Verantwortung fuer Architektur uebernehmen will.\nAI: Was reizt Sie an dieser Stelle?\nUser: Die Rolle ist staerker auf Systemdesign ausgelegt und nutzt einen modernen Stack. Verfuegbar waere ich in 3 Monaten wegen Kuendigungsfrist. Gehaltlich stelle ich mir 85000 Euro vor.\nAI: Vielen Dank, das war sehr aufschlussreich."
    }
  }' \
  -w "\n\nHTTP %{http_code}\n"
echo
echo "Wenn alles passt: Antwort {ok:true,...} hier UND eine Nachricht in deinem Slack-Channel."
