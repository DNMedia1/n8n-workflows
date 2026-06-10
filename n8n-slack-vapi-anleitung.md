# n8n lokal mit Docker + Slack einrichten

## 1. n8n lokal starten

Im Projektordner ausführen:

```bash
docker compose up -d
```

Danach n8n im Browser öffnen:

```text
http://localhost:5678
```

Beim ersten Start legt n8n einen lokalen Owner-Account an.

## 2. Slack App erstellen

1. Öffne https://api.slack.com/apps.
2. Klicke auf "Create New App".
3. Wähle "From scratch".
4. Name: "Vapi HR Agent".
5. Workspace auswählen.
6. App erstellen.

## 3. Incoming Webhook aktivieren

1. In der Slack App links auf "Incoming Webhooks" gehen.
2. "Activate Incoming Webhooks" einschalten.
3. Auf "Add New Webhook to Workspace" klicken.
4. Ziel-Channel auswählen, z. B. "#hr" oder "#bewerbungen".
5. Erlauben.
6. Die Webhook URL kopieren.

Die URL sieht ungefähr so aus:

```text
https://hooks.slack.com/services/...
```

Diese URL geheim halten. Wer sie hat, kann in den gewählten Channel posten.

## 4. n8n Workflow bauen

In n8n:

1. "New Workflow" erstellen.
2. Node "Webhook" hinzufügen.
3. Method: `POST`.
4. Path: `vapi-call-ended`.
5. Node "Code" oder "AI Agent"/"OpenAI" hinzufügen, um das Transkript auszuwerten.
6. Node "HTTP Request" hinzufügen, um an Slack zu senden.

Slack HTTP Request:

- Method: `POST`
- URL: deine Slack Webhook URL
- Body Content Type: `JSON`
- Body:

```json
{
  "text": "Neues Bewerbergespräch abgeschlossen\n\nEmpfehlung: Weiterführen\nScore: 8/10\n\nKurzfazit:\nDer Bewerber passt gut zur Rolle."
}
```

## 5. Vapi Webhook anbinden

In Vapi bei den Assistant Server/Advanced/Messaging Einstellungen:

```text
http://localhost:5678/webhook/vapi-call-ended
```

Wichtig: Diese URL funktioniert nur lokal auf deinem Rechner. Für echte Vapi Calls braucht Vapi eine öffentlich erreichbare URL.

Für einen Test mit Vapi brauchst du daher einen Tunnel, z. B.:

```bash
ngrok http 5678
```

Dann in Vapi die öffentliche ngrok URL eintragen:

```text
https://deine-ngrok-url.ngrok-free.app/webhook/vapi-call-ended
```

## 6. Logischer Ziel-Workflow

```text
Vapi Call endet
-> Vapi sendet Webhook an n8n
-> n8n liest Transkript aus
-> KI-Modell erstellt Bewerberprotokoll
-> n8n sendet Ergebnis an Slack
```

## 7. Auswertungs-Prompt

```text
Du bist ein HR-Interview-Analyst.

Analysiere das folgende Gesprächstranskript eines Bewerber-Erstgesprächs.
Bewerte nur auf Basis des Transkripts. Erfinde keine Informationen.
Wenn Informationen fehlen, liste sie als fehlende Informationen.

Bewerte:
- Rollenfit
- relevante Erfahrung
- Motivation
- Kommunikationsfähigkeit
- Verfügbarkeit
- Gehaltsrahmen
- Wechselgrund
- Risiken / Red Flags
- Empfehlung für HR

Gib das Ergebnis als JSON zurück:

{
  "kurzzusammenfassung": "",
  "rollenfit_score": 0,
  "erfahrung_score": 0,
  "motivation_score": 0,
  "kommunikation_score": 0,
  "gesamt_score": 0,
  "staerken": [],
  "risiken": [],
  "fehlende_informationen": [],
  "empfehlung": "weiterführen | prüfen | ablehnen",
  "slack_nachricht": ""
}

Transkript:
{{transcript}}
```
