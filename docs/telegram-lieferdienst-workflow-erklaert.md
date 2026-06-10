# Telegram-Lieferdienst-Bot — Workflow erklärt

Technische Schritt-für-Schritt-Referenz zum n8n-Workflow **„Telegram Lieferdienst
Bestellung Demo"** (`gGYPV28ggPpGlgLf`). Ergänzt die High-Level-Anleitung
`n8n-telegram-lieferdienst-anleitung.md` um die innere Logik (Formeln, Regeln, Felder).

---

## 1. Überblick

Ein Telegram-Bot („Steinofenbot") nimmt **Text- und Sprach-Bestellungen** entgegen,
versteht sie per LLM, validiert gegen eine **Speisekarten-Datenbank**, rechnet Preis
und Wartezeit, speichert die Bestellung, benachrichtigt die Küche per **Slack** und
antwortet dem Kunden.

**Bausteine:**
- **n8n** — Orchestrierung (läuft im Container `vapi-n8n` auf dem Hostinger-VPS)
- **n8n Data Tables** — interne DB (`lieferdienst_speisekarte`, `lieferdienst_bestellungen`)
- **OpenRouter** — LLM (`meta-llama/llama-3.3-70b-instruct`) + STT (`openai/whisper-1`)
- **Telegram Bot API** — Kundenkanal
- **Slack Incoming Webhook** — interne Küchenmeldung (`#test-channel-steinofen-bot`)
- **Restaurant-Basis:** Blenkerstr. 39, 76187 Karlsruhe

---

## 2. Datenfluss (Ablaufdiagramm)

```
Telegram Trigger
   └─ Telegram Nachricht normalisieren
        └─ Voice?  ──ja──► Telegram Voice laden ► Voice Audio vorbereiten
        │                     └─ OpenRouter Voice transkribieren ──Fehler──► Sprachfehler Antwort
        │                          └─ Voice als Text ┐
        └──nein──► Text als Text ───────────────────┤
                                                     ▼
                                        Nachricht vereinheitlichen (Merge)
                                                     ▼
                              Speisekarte laden ► Bestellungen laden
                                                     ▼
                                        Bestellassistent Prompt bauen
                                                     ▼
                                     OpenRouter Bestellung verstehen (LLM)
                                                     ▼
                                          Bestellantwort bauen  ──┐ (4 parallele Ausgänge)
        ┌───────────────────────────┬─────────────────────────────┼───────────────────────────┐
        ▼                           ▼                             ▼                           ▼
 Bestellung speichern?       Slack senden?              Telegram Antwort senden     Speisekarte PDF senden?
        ▼                           ▼                             (an Kunde)                  ▼
 Bestellung speichern       Slack Bestellung senden                              Telegram Speisekarte PDF senden
   (Data Table)               (HTTP → Slack)                                          (PDF an Kunde)
```

---

## 3. Schritt für Schritt

### Phase 1 — Eingang & Normalisierung
| # | Node | Typ | Funktion |
|---|---|---|---|
| 1 | **Telegram Trigger** | telegramTrigger | Startpunkt; empfängt jede Nachricht (Text/Sprache). |
| 2 | **Telegram Nachricht normalisieren** | code | Extrahiert `chat_id`, Name, Text bzw. Voice-Datei-ID; vereinheitlicht. |
| 3 | **Voice?** | if | Weiche: Sprachnachricht? ja → Sprachpfad, nein → Textpfad. |

### Phase 2 — Zwei Eingabepfade
| # | Node | Typ | Funktion |
|---|---|---|---|
| 4 | **Telegram Voice laden** | telegram | Lädt die Audiodatei von Telegram. |
| 5 | **Voice Audio vorbereiten** | code | Audio → Base64/Data-URI fürs STT. |
| 6 | **OpenRouter Voice transkribieren** | httpRequest | Whisper-STT → Text. Eigener **Fehlerausgang** (retry + onError). |
| — | ↳ **Sprachfehler Antwort** | telegram | Bei STT-Fehler: bittet höflich um Textnachricht. |
| 7 | **Voice als Text** | code | Schreibt Transkript in `order_text`. |
| — | **Text als Text** | code | Textpfad: übernimmt getippten Text als `order_text`. |

### Phase 3 — Zusammenführen & Kontext
| # | Node | Typ | Funktion |
|---|---|---|---|
| 8 | **Nachricht vereinheitlichen** | merge | Führt Text- und Sprachpfad zu einem Strang zusammen. |
| 9 | **Speisekarte laden** | dataTable | Artikel aus `lieferdienst_speisekarte` (Name, Preis, Zubereitung, Verfügbarkeit). |
| 10 | **Bestellungen laden** | dataTable | Offene Bestellungen (Auslastung) + evtl. unvollständige des Kunden. |

### Phase 4 — KI-Verständnis
| # | Node | Typ | Funktion |
|---|---|---|---|
| 11 | **Bestellassistent Prompt bauen** | code | Baut System-+User-Prompt: Speisekarte, Regeln, Kundennachricht. |
| 12 | **OpenRouter Bestellung verstehen** | httpRequest | Llama 3.3 70B → strukturiertes JSON (Intent, Artikel, Adresse, `lieferart`, fehlende Infos). |

### Phase 5 — Geschäftslogik
| # | Node | Typ | Funktion |
|---|---|---|---|
| 13 | **Bestellantwort bauen** | code | Validiert Artikel, rechnet Preis + Wartezeit, prüft Vollständigkeit, baut Telegram-/Slack-Text, setzt Flags. |

### Phase 6 — Vier Ausgänge
| # | Node | Typ | Funktion |
|---|---|---|---|
| 14a | **Bestellung speichern?** → **Bestellung speichern** | if → dataTable | Bestellung in `lieferdienst_bestellungen` ablegen. |
| 14b | **Slack senden?** → **Slack Bestellung senden** | if → httpRequest | Interne Küchenmeldung nach `#test-channel-steinofen-bot`. |
| 14c | **Telegram Antwort senden** | telegram | Bestätigung/Antwort an den Kunden. |
| 14d | **Speisekarte PDF senden?** → **Telegram Speisekarte PDF senden** | if → telegram | Bei Sortimentsfragen die PDF-Karte mitsenden. |

---

## 4. Deep-Dive: Wartezeit-Formel

Berechnet in „Bestellantwort bauen". Alles in Minuten:

```
maxPrep            = max(Zubereitungszeit aller Artikel)        (Default/Minimum 12)
effectiveOpenOrders= min(max(offene_bestellungen, 0), 4)        (gedeckelt bei 4)
loadSurcharge      = effectiveOpenOrders * 5                     (Auslastung)
extraItemSurcharge = max(0, itemCount - 3) * 2                   (ab dem 4. Artikel)

# Lieferung vs. Abholung:
deliveryBuffer     = (Lieferung und Adresse vorhanden) ? 25 : 0  (Fahrzeit-Puffer)
deliveryMinimum    = (Lieferung und Adresse vorhanden) ? 60 : 20 (Untergrenze)

rawWaitMinutes     = maxPrep + deliveryBuffer + loadSurcharge + extraItemSurcharge
waitMinutes        = min(90, max(deliveryMinimum, round(rawWaitMinutes / 5) * 5))
waitRange          = waitMinutes  bis  waitMinutes + 10
```

- Ergebnis wird auf **5 Minuten gerundet** und als Spanne ausgegeben (z. B. „ca. 20–30 Minuten").
- **Obergrenze 90 Min**, **Untergrenze** 60 (Lieferung) bzw. 20 (Abholung).
- **Beispiel Abholung**, 2 Artikel, Zubereitung 18 Min, 1 offene Bestellung:
  `18 + 0 + 5 + 0 = 23 → round/5 = 25 → max(20,25)=25` → **„ca. 25–35 Minuten"**, ohne Fahrzeit.

---

## 5. Deep-Dive: Adress-Normalisierung

In „Bestellantwort bauen" (`normalizeAddress`), robust gegen Sprach-Erkennungsfehler
in der Region Karlsruhe:

| Eingabe (gesprochen/erkannt) | Korrektur |
|---|---|
| `7 6 3 4 4` (einzeln gesprochene PLZ) | `76344` |
| `Eckenstein` / `Eckestein` / `Eckstein` | `Eggenstein` |
| `Leopardshafen` / `Leopartshafen` / `Leopolshafen` | `Leopoldshafen` |
| `Eggenstein Leopoldshafen` / `Eggenstein, Leopoldshafen` | `Eggenstein-Leopoldshafen` |
| `76344 Eggenstein Leopoldshafen` | `76344 Eggenstein-Leopoldshafen` |
| Mehrfach-Leerzeichen | auf einfaches Leerzeichen reduziert |

Zusätzlich normalisiert das **LLM** Ortsnamen schon im Prompt (gleiche Regeln).

---

## 6. Deep-Dive: Lieferung vs. Abholung

- Erkennung über **Schlüsselwörter** in der Nachricht (`abhol…`, `zum Mitnehmen`,
  `selbst vorbei`, `komme … vorbei`) **oder** wenn das LLM `lieferart: "abholung"` setzt.
- **Bei Abholung:** keine Lieferadresse nötig (Bestellung gilt auch ohne Adresse als
  vollständig), kein Fahrzeit-Puffer, Untergrenze 20 Min. Ausgabe:
  > *Abholung bei: Blenkerstr. 39, 76187 Karlsruhe — Voraussichtlich abholbereit in: ca. X Minuten*
- **Bei Lieferung:** Adresse Pflicht, Fahrzeit-Puffer + Untergrenze 60 Min, Ausgabe mit
  *Lieferadresse*.

---

## 7. Deep-Dive: Schutz vor „alten Bestellungen" (Stale-Merge)

Damit eine neue Kurz-Nachricht nicht mit einer alten unvollständigen Bestellung
verschmilzt (Ursache für falsche Artikel/Adresse), gilt in „Bestellassistent Prompt bauen":

- Eine unvollständige Bestellung wird nur herangezogen, wenn sie **jünger als 30 Minuten**
  ist **und** dem Chat des Kunden gehört.
- **Nennt die neue Nachricht eigene Artikel**, wird sie als **neue** Bestellung behandelt
  (`newHasOrderItems`) — keine alten Artikel/Adressen übernommen.
- Nur reine Nachreichungen (z. B. fehlende Adresse, keine neuen Artikel) ergänzen die
  offene Bestellung.

---

## 8. Deep-Dive: Slack-Versand

- **Gate „Slack senden?":** sendet, wenn `send_slack` true ist **und** eine Webhook-URL
  verfügbar ist: `SLACK_STEINOFENBOT_WEBHOOK_URL || SLACK_ORDERS_WEBHOOK_URL || (Fallback)`.
- **`send_slack`** wird nur bei **vollständiger** Bestellung gesetzt.
- **URL-Priorität:** `$env.SLACK_STEINOFENBOT_WEBHOOK_URL` hat Vorrang; danach
  `$env.SLACK_ORDERS_WEBHOOK_URL`; zuletzt ein im Workflow hinterlegter Fallback-Webhook.
- Moderne Slack-Webhooks sind fest an **einen** Channel gebunden (das `channel`-Feld im
  Payload ist nur informativ). Für `#test-channel-steinofen-bot` muss der Webhook in Slack
  genau für diesen Channel erstellt sein.

---

## 9. Order-JSON (Ausgabe von „Bestellantwort bauen")

| Feld | Bedeutung |
|---|---|
| `bestell_id` | `LD-<YYYYMMDDHHMMSS>` |
| `chat_id` | Telegram-Chat des Kunden |
| `kunde_name`, `telefon` | optional |
| `adresse` | normalisierte Lieferadresse (bei Abholung leer) |
| `positionen[]` | `{artikel_id, name, menge, einzelpreis_eur, gesamtpreis_eur, sonderwunsch}` |
| `artikel_text` | Positionen als Kurztext |
| `gesamtpreis_eur` | Summe |
| `offene_bestellungen` | Auslastung zum Bestellzeitpunkt |
| `wartezeit_min`, `wartezeit_text` | berechnete Wartezeit + Spanne |
| `lieferart` | `lieferung` \| `abholung` |
| `status` | `offen` \| `unvollstaendig` \| `info` |
| `complete` | Bestellung vollständig? |
| `save_order`, `send_slack`, `should_send_menu_pdf` | Steuer-Flags für die Ausgänge |
| `missing[]` | fehlende Angaben (z. B. Lieferadresse) |
| `telegram_reply`, `slack_text` | fertige Texte für Kunde/Küche |
| `raw_text`, `input_type` | Originalnachricht, Text/Voice |
| `created_at` | ISO-Zeitstempel |

---

## 10. Benötigte Env-Variablen (VPS `.env`)

```
OPENROUTER_API_KEY=...                 # LLM + Whisper-STT
SLACK_STEINOFENBOT_WEBHOOK_URL=...      # bevorzugt: Webhook für #test-channel-steinofen-bot
SLACK_ORDERS_WEBHOOK_URL=...            # optional: alternativer Bestell-Channel
SLACK_ORDERS_CHANNEL=#test-channel-steinofen-bot   # nur Payload-Hinweis
MENU_PDF_URL=...                        # optional: PDF-Speisekarte
```

---

## 11. Bekannte Demo-Grenzen / nächste Schritte

- Wartezeit ist eine **Heuristik** (keine echte Routing-/Stau-Berechnung). Für Produktion:
  Google Routes / OpenRouteService / eigener OSRM-Dienst.
- Keine menschliche Freigabe vor finaler Annahme.
- Speisekarte ist fiktiv (Demo-Daten).
- „Artikel zu offener Bestellung hinzufügen" startet aktuell bewusst eine neue Bestellung
  (Schutz vor Fehlbestätigungen) — bei Bedarf feiner justierbar.
