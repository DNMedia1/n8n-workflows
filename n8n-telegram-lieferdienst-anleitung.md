# Telegram Lieferdienst Demo-Workflow

Diese Demo nutzt n8n als Automationsplattform und n8n Data Tables als interne Datenbank.

## Dateien

- `data/lieferdienst-speisekarte.json` - Seed-Daten der fiktiven Demo-Speisekarte
- `n8n-lieferdienst-demo-db-setup.json` - legt die Data Tables an und befuellt die Speisekarte
- `n8n-telegram-lieferdienst-workflow.json` - verarbeitet Telegram Text- und Sprachnachrichten
- `scripts/generate-lieferdienst-workflows.js` - erzeugt die drei Dateien erneut
- `scripts/test-generate-lieferdienst-workflows.js` - prueft die wichtigsten Workflow-Eigenschaften

## Datenbanktabellen

Der Setup-Workflow erstellt:

- `lieferdienst_speisekarte`
- `lieferdienst_bestellungen`

Die Speisekarte wird per `artikel_id` upserted. Der Setup-Workflow kann also erneut ausgefuehrt
werden, ohne die gleichen Artikel mehrfach anzulegen.

## Voraussetzungen

In n8n:

- Telegram Bot Credential einrichten
- Optional: Slack Incoming Webhook fuer einen Bestell-/Kuechen-Channel einrichten
- Setup-Workflow importieren und einmal manuell ausfuehren
- Telegram-Workflow importieren
- In allen Telegram-Nodes dasselbe Bot-Credential auswaehlen

In der n8n-Umgebung:

```text
OPENROUTER_API_KEY=...
SLACK_STEINOFENBOT_WEBHOOK_URL=...
SLACK_ORDERS_WEBHOOK_URL=...
SLACK_ORDERS_CHANNEL=#test-channel-steinofen-bot
MENU_PDF_URL=...
```

`OPENROUTER_API_KEY` wird fuer Sprachnachrichten und fuer die Bestellextraktion aus Text
oder Transkript genutzt.
`SLACK_STEINOFENBOT_WEBHOOK_URL` ist die bevorzugte URL fuer den Slack-Channel
`#test-channel-steinofen-bot`. Alternativ kann `SLACK_ORDERS_WEBHOOK_URL` auf einen separaten
Bestell-Channel zeigen. Bei modernen Slack Incoming Webhooks ist der Ziel-Channel in
Slack am Webhook festgelegt; das Feld `SLACK_ORDERS_CHANNEL` ist nur ein zusaetzlicher
Hinweis im Payload und ersetzt keinen channel-spezifischen Webhook. Wenn Slack kurzzeitig
ausfaellt, soll die Telegram-Antwort trotzdem der primaere Kundendialog bleiben.
`MENU_PDF_URL` ist optional. Wenn gesetzt, schickt der Bot diese PDF-Speisekarte bei Fragen
nach Speisekarte, Sortiment, Preisen oder Groessen mit. Wenn sie fehlt, nutzt der Demo-Workflow
einen Fallback-Link zur aktuellen Steinofen-PDF.

## Ablauf

```text
Telegram Nachricht
-> Text direkt nutzen oder Voice-Datei laden
-> Voice-Datei transkribieren
-> Speisekarte aus Data Table laden
-> bei Speisekarten-/Sortimentsfragen PDF-Speisekarte mitsenden
-> offene Bestellungen aus Data Table laden
-> Bestellung als JSON extrahieren
-> Lieferadresse geocodieren
-> Route ab Blenkerstr. 39, 76187 Karlsruhe berechnen
-> Preis, Entfernung und Wartezeit berechnen
-> vollstaendige Bestellung speichern
-> interne Slack-Benachrichtigung mit Bestellung, Adresse und Lieferdaten senden
-> Antwort an Telegram senden
```

## Demo-Testnachricht

```text
Hallo, ich haette gerne 2 Pizza Salami, eine Cola und Pommes.
Lieferadresse ist Kaiserstrasse 100 in Karlsruhe.
Name ist Max.
```

Erwartung:

- Bestellung wird erkannt
- Speisekarte wird aus `lieferdienst_speisekarte` gelesen
- offene Bestellungen werden aus `lieferdienst_bestellungen` gezaehlt
- Lieferadresse wird im Hintergrund geocodiert
- Route wird ab `Blenkerstr. 39, 76187 Karlsruhe` berechnet
- Wartezeit wird aus Zubereitungszeit, Route und Auslastung berechnet
- Bestellung wird in `lieferdienst_bestellungen` gespeichert

## Bekannte Demo-Grenzen

- Die Route wird ueber oeffentliche OpenStreetMap/Nominatim- und OSRM-Demo-Endpunkte berechnet.
  Fuer Produktion sollte dafuer ein eigener Geocoding-/Routing-Dienst oder ein bezahlter Anbieter genutzt werden.
- Es gibt noch keine echte Traffic-/Stau-Beruecksichtigung.
- Es gibt noch keine menschliche Freigabe vor der finalen Annahme.
- Die Speisekarte ist fiktiv und dient als Demo-Datenbank.

Fuer Produktion waeren die naechsten Schritte:

- Google Routes API, OpenRouteService oder eigenen OSRM-Dienst fuer robuste Fahrzeit anbinden
- Admin-/Kuechen-Chat fuer neue Bestellungen informieren
- Bestellungen per Status aktualisieren
- verbindliche Kundenzusammenfassung mit Bestaetigungsbutton einfuehren
