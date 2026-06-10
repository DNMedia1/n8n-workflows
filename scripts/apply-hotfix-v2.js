#!/usr/bin/env node
/*
 * Additiver, reversibler Hotfix fuer den Telegram-Lieferdienst-Workflow.
 *
 * Ziel: Zuverlaessigkeit erhoehen, ohne die funktionierende Happy-Path-Logik zu
 * veraendern. Es werden NUR Robustheits-Eigenschaften ergaenzt:
 *
 *  1. Retry + Timeout auf allen externen HTTP-Nodes (Transkription, Bestell-LLM,
 *     Geocoding, Routing) -> faengt transiente Fehler (5xx / Timeout) ab.
 *  2. Transkription bekommt einen Fehler-Ausgang (onError: continueErrorOutput),
 *     der zu einem neuen Telegram-Node "Sprachfehler Antwort" fuehrt. Dadurch
 *     bekommt der Nutzer bei jedem Transkriptionsfehler eine verstaendliche
 *     Nachricht statt Stille, und die Execution bleibt sichtbar/auswertbar.
 *  3. Geocoding / Routing / Bestell-LLM degradieren bei Fehler ueber
 *     continueRegularOutput, statt die ganze Execution abzubrechen
 *     (die nachgelagerte Logik faengt fehlende Daten bereits ab).
 *
 * Eingabe : n8n-telegram-lieferdienst-workflow.json (Original, bleibt unveraendert)
 * Ausgabe : n8n-telegram-lieferdienst-workflow-v2-hotfix.json (neue Version)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const inFile = path.join(root, 'n8n-telegram-lieferdienst-workflow.json');
const outFile = path.join(root, 'n8n-telegram-lieferdienst-workflow-v2-hotfix.json');

const wf = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const byId = new Map(wf.nodes.map((n) => [n.id, n]));

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 };

function patch(id, props) {
  const node = byId.get(id);
  if (!node) throw new Error('Node nicht gefunden: ' + id);
  Object.assign(node, props);
}

// 1) Transkription: Retry + Fehler-Ausgang
patch('openrouter-transcription', { ...RETRY, onError: 'continueErrorOutput' });

// 2) Bestell-LLM, Geocoding, Routing: Retry + graceful degrade
patch('openrouter-order', { ...RETRY, onError: 'continueRegularOutput' });
patch('geocode-address', { ...RETRY, onError: 'continueRegularOutput' });
patch('calculate-route', { ...RETRY, onError: 'continueRegularOutput', alwaysOutputData: true });

// 3) Neuer Telegram-Node fuer verstaendliche Sprachfehler-Antwort
const voiceErrorNode = {
  parameters: {
    resource: 'message',
    operation: 'sendMessage',
    chatId: "={{ $('Telegram Eingang normalisieren').first().json.chat_id }}",
    text: 'Entschuldigung, ich konnte deine Sprachnachricht gerade nicht verarbeiten. Bitte sende deine Bestellung als kurze Textnachricht (Artikel, Menge und Lieferadresse).',
    additionalFields: { appendAttribution: false },
  },
  id: 'voice-error-reply',
  name: 'Sprachfehler Antwort',
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [1680, 80],
};
if (!byId.has('voice-error-reply')) {
  wf.nodes.push(voiceErrorNode);
}

// 4) Fehler-Ausgang der Transkription mit dem neuen Node verbinden.
//    main[0] = Erfolg (bestehend), main[1] = Fehler (neu).
const tConn = wf.connections['OpenRouter Transkription'];
if (!tConn.main[1]) {
  tConn.main[1] = [{ node: 'Sprachfehler Antwort', type: 'main', index: 0 }];
}

// Version/Marker aktualisieren, damit die Datei eindeutig ist
wf.versionId = 'telegram-lieferdienst-bestellung-demo-v2-hotfix';
wf.name = 'Telegram Lieferdienst Bestellung Demo v2 (Hotfix)';

const nodeCountBefore = wf.nodes.length;
fs.writeFileSync(outFile, JSON.stringify(wf, null, 2) + '\n');

// Validierung
const reparsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
const ok =
  reparsed.nodes.some((n) => n.id === 'voice-error-reply') &&
  reparsed.connections['OpenRouter Transkription'].main.length === 2 &&
  reparsed.nodes.find((n) => n.id === 'openrouter-transcription').retryOnFail === true;

console.log('Geschrieben:', path.basename(outFile));
console.log('Nodes gesamt:', reparsed.nodes.length);
console.log('Validierung bestanden:', ok);
