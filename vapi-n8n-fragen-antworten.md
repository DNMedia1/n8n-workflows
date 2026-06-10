# Vapi/n8n Workflow - Fragen und Antworten

## 1. Wie wird die Bewertung des Gesprächs vorgenommen?

Nach dem Call sendet Vapi den Call-Payload an n8n. n8n extrahiert Transkript, Name, Rolle und Call-Daten. Danach bewertet ein LLM das Gespräch nach festen Kriterien wie Erfahrung, Motivation, Kommunikation, Verfügbarkeit, Gehalt, Stärken, Risiken und fehlenden Informationen.

Daraus wird ein strukturiertes Bewerberprotokoll erstellt und per Slack versendet.

## 2. Vorstellung der Vapi Einstellungen: Instructions, Voice und Advanced Messaging

**Instructions:** Evi führt ein kurzes deutsches Erstgespräch. Sie fragt nach Zustimmung zur Aufzeichnung, Name, Rolle, Erfahrung, Technologien, Projekten, Motivation, Verfügbarkeit und Gehalt. Sie bewertet nicht im Gespräch.

**Voice:** Eine klare, natürliche und schnelle Stimme, z. B. Clara.

**Advanced / Messaging:** Vapi sendet nach Call-Ende den `end-of-call-report` an den n8n Webhook:

```text
https://srv1651618.hstgr.cloud/webhook/vapi-call-ended
```

## 3. Welches Voice-/Modell-Setup ist am besten?

Für das LLM im Sprachagenten würde ich `Gemini 2.5 Flash` nehmen. Es ist schnell, versteht Deutsch gut und wirkt im Gespräch natürlich.

Für maximale Geschwindigkeit könnte man Flash-Lite testen, aber Flash ist meist der bessere Kompromiss aus Qualität und Latenz.

## 4. Wie kann man den Delay des Agents verringern?

- kürzere Instructions
- kurze Antworten erzwingen
- schnelles Modell wie Gemini Flash nutzen
- schnelle Voice/TTS wählen
- Endpointing optimieren
- nur eine Frage pro Antwort stellen
- keine Tools während des Calls ausführen
- Webhook-Auswertung erst nach Call-Ende starten
- Transcriber mit niedriger Latenz nutzen

## 5. Wie könnte man ein Transkript ohne Vapi-eigenes Transkript erstellen?

Man könnte das Call-Audio separat speichern und mit Deepgram, Whisper, AWS Transcribe oder einem eigenen STT-System transkribieren.

Das ist sinnvoll, weil man mehr Kontrolle über Qualität, Datenschutz, Speicherort und Anbieterabhängigkeit bekommt.

## 6. Bonus: Wie könnte man vermeiden, dass Daten in die USA gesendet werden?

Das müsste man komplett entlang der Datenkette prüfen: Vapi, STT, LLM, TTS, n8n, Slack und Storage.

Standardmäßig kann ich bei Vapi, OpenRouter und Slack nicht garantieren, dass keine Daten in die USA gehen. Für ein EU-only Setup bräuchte man EU-gehostete Dienste, eigene Speicherung, EU-LLM/STT/TTS und klare AV-Verträge sowie eine Prüfung der Subprozessoren.

## 7. Bonus: Wie könnte man AWS im Setup mit Vapi nutzen?

AWS könnte man als Backend nutzen:

```text
Vapi -> n8n/API Gateway -> Lambda -> S3/DynamoDB/AWS Transcribe/Bedrock -> Slack
```

Sinnvoll wäre AWS für Speicherung, eigene Transkription, Monitoring und sichere Verarbeitung.

Wichtig wären:

- Region `eu-central-1`
- Verschlüsselung
- saubere IAM-Rechte
- Secrets Manager fuer API Keys
- wenig Logging personenbezogener Daten
- klare Aufbewahrungsfristen
