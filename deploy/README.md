# n8n Vapi→Slack Workflow auf Hostinger VPS deployen

Ersetzt das lokale `Docker + ngrok`-Setup durch eine **dauerhafte HTTPS-URL**.
Kein ngrok mehr, kein Neueintragen in Vapi nach jedem Neustart.

```
Vapi  →  https://n8n.deine-domain.de/webhook/vapi-call-ended
              │  (DNS A-Record → VPS-IP)
        Caddy  (Port 80/443, automatisches HTTPS via Let's Encrypt)
              │  reverse_proxy
        n8n    (intern Port 5678)
              │
        OpenRouter (Llama 3.3 70B)  →  Slack
```

## Voraussetzungen
- Hostinger KVM VPS mit Root/SSH (Ubuntu/Debian)
- Domain bei Hostinger
- Slack Incoming Webhook URL  (`https://hooks.slack.com/services/...`)
- OpenRouter API Key  (`sk-or-v1-...`)

---

## Schritt 1 – DNS: Subdomain auf den VPS zeigen
Im **hPanel → Domains → DNS / Nameserver**:
- Typ: `A`
- Name: `n8n`   (ergibt `n8n.deine-domain.de`)
- Zeigt auf: **IP deines VPS** (steht im hPanel beim VPS)
- TTL: Standard

DNS-Propagation prüfen (vom eigenen Rechner):
```bash
dig +short n8n.deine-domain.de
```
Muss die VPS-IP zurückgeben, bevor du weitermachst (sonst schlägt das HTTPS-Zertifikat fehl).

## Schritt 2 – Per SSH auf den VPS
```bash
ssh root@DEINE_VPS_IP
```

## Schritt 3 – Deploy-Dateien auf den VPS bringen
Vom **lokalen Rechner** aus (neues Terminal im Projektordner):
```bash
scp -r deploy root@DEINE_VPS_IP:/opt/vapi-n8n
```
Das Workflow-JSON (`n8n-vapi-slack-workflow-v2-prod.json`) bleibt lokal –
das importierst du später im Browser in n8n.

## Schritt 4 – .env ausfüllen (auf dem VPS)
```bash
cd /opt/vapi-n8n
cp .env.example .env
nano .env
```
Eintragen:
- `N8N_HOST=n8n.deine-domain.de`
- `ACME_EMAIL=` deine E-Mail
- `SLACK_WEBHOOK_URL=` deine Slack-URL
- `SLACK_STEINOFENBOT_WEBHOOK_URL=` bevorzugt: eigener Slack-Webhook fuer `#test-channel-steinofen-bot`
- `SLACK_ORDERS_WEBHOOK_URL=` optional: eigener Slack-Webhook fuer Bestell-/Kuechen-Channel
- `SLACK_ORDERS_CHANNEL=#test-channel-steinofen-bot` optionaler Payload-Hinweis; ersetzt keinen channel-spezifischen Webhook
- `MENU_PDF_URL=` optional: PDF-Speisekarte fuer Telegram-Sortimentsfragen
- `OPENROUTER_API_KEY=` dein Key (der `sk-or-v1-...` aus deiner lokalen `.env`)

Speichern: `Strg+O`, `Enter`, `Strg+X`.

## Schritt 5 – Stack starten
```bash
bash setup.sh
```
Installiert Docker (falls nötig), öffnet Ports, startet n8n + Caddy.
Das HTTPS-Zertifikat wird automatisch geholt (30–60s).

Prüfen:
```bash
docker compose ps          # beide Container "Up"
docker compose logs -f      # Logs (Strg+C zum Beenden)
```

## Schritt 6 – n8n öffnen & Owner-Account anlegen
Browser: `https://n8n.deine-domain.de`
Beim ersten Start legt n8n einen Owner-Account an (E-Mail + Passwort). Merken!

## Schritt 7 – Workflow importieren & aktivieren
1. In n8n: **oben rechts ⋮ → Import from File**
2. `n8n-vapi-slack-workflow-v2-prod.json` auswählen
3. Der Slack-Node nutzt fuer Bestellungen zuerst `{{ $env.SLACK_STEINOFENBOT_WEBHOOK_URL }}`.
   Diese URL sollte in Slack direkt fuer `#test-channel-steinofen-bot` erstellt sein.
4. **Toggle oben rechts auf „Active"** schalten.

> Slack-URLs und OpenRouter-Key liegen in der `.env` auf dem VPS – nicht im Workflow.
> Wenn du sie änderst: `.env` editieren → `docker compose up -d` (Container neu laden).

## Schritt 8 – Vapi anbinden
Im Vapi-Assistant unter Server-/Messaging-URL eintragen:
```
https://n8n.deine-domain.de/webhook/vapi-call-ended
```

## Schritt 9 – Ende-zu-Ende testen
Auf dem VPS:
```bash
cd /opt/vapi-n8n
./test-call.sh
```
Erwartung: JSON-Antwort `{"ok":true,...}` **und** eine formatierte Nachricht
im Slack-Channel. Danach einen echten Vapi-Testcall machen.

---

## Wartung
- **n8n updaten:** `cd /opt/vapi-n8n && docker compose pull && docker compose up -d`
- **Secrets ändern:** `.env` editieren → `docker compose up -d`
- **Backup:** Das Docker-Volume `n8n_data` enthält alle Workflows & Credentials.

## Troubleshooting
| Symptom | Ursache / Fix |
|---|---|
| HTTPS lädt nicht / Zertifikatsfehler | DNS zeigt (noch) nicht auf die VPS-IP → `dig +short n8n.deine-domain.de`. Caddy-Logs: `docker compose logs caddy` |
| Webhook 404 „not registered" | Workflow nicht **Active** (Schritt 7) |
| Slack kommt nicht im Steinofenbot-Channel an | `SLACK_STEINOFENBOT_WEBHOOK_URL` fehlt oder zeigt auf den falschen Slack-Channel → Webhook fuer `#test-channel-steinofen-bot` erstellen, `.env` setzen, `docker compose up -d`. In n8n: Execution-Log des Slack-Nodes pruefen |
| LLM-Node Fehler 401 | `OPENROUTER_API_KEY` falsch → `.env` korrigieren, `docker compose up -d` |
| Seite nicht erreichbar | Ports 80/443 zu → Hostinger hPanel-Firewall + `ufw status` prüfen |
