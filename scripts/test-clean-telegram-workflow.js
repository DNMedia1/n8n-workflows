#!/usr/bin/env node

const assert = require('node:assert/strict');
const { buildCleanWorkflow } = require('./build-clean-telegram-workflow');

const workflow = buildCleanWorkflow();
const names = new Set(workflow.nodes.map((node) => node.name));
const json = JSON.stringify(workflow);

assert.equal(workflow.name, 'Telegram Lieferdienst Bestellung Demo');
assert.ok(workflow.nodes.length <= 24, `clean workflow should stay compact, got ${workflow.nodes.length}`);

[
  'Telegram Trigger',
  'Telegram Nachricht normalisieren',
  'Voice?',
  'Telegram Voice laden',
  'Voice Audio vorbereiten',
  'OpenRouter Voice transkribieren',
  'Voice als Text',
  'Text als Text',
  'Nachricht vereinheitlichen',
  'Speisekarte laden',
  'Bestellungen laden',
  'Bestellassistent Prompt bauen',
  'OpenRouter Bestellung verstehen',
  'Bestellantwort bauen',
  'Bestellung speichern?',
  'Bestellung speichern',
  'Slack senden?',
  'Slack Bestellung senden',
  'Telegram Antwort senden',
  'Speisekarte PDF senden?',
  'Telegram Speisekarte PDF senden',
].forEach((name) => assert.ok(names.has(name), `missing node: ${name}`));

assert.ok(!json.includes('Lieferadresse geocodieren'), 'clean workflow should not contain geocoding node');
assert.ok(!json.includes('Route berechnen'), 'clean workflow should not contain route node');
assert.ok(json.includes('openai/whisper-1'), 'voice transcription should keep the working Telegram OGG model');
assert.ok(json.includes('SLACK_STEINOFENBOT_WEBHOOK_URL'), 'Slack should prefer the Steinofenbot webhook');
assert.ok(json.includes('#test-channel-steinofen-bot'), 'Slack payload should identify the Steinofenbot test channel');
assert.ok(!workflow.nodes.find((node) => node.name === 'Slack Bestellung senden').parameters.url.includes('SLACK_WEBHOOK_URL'), 'orders must never fall back to the generic HR/WAPI Slack webhook');
assert.ok(json.includes('normalizeAddress'), 'workflow should normalize STT/dialect address variants');
assert.ok(json.includes('Eggenstein-Leopoldshafen'), 'workflow should know the canonical Eggenstein-Leopoldshafen spelling');
assert.ok(json.includes('effectiveOpenOrders = Math.min'), 'wait time should cap stale/test open-order load');
assert.ok(json.includes('deliveryMinimum = address ? 60 : 20'), 'delivery orders should have a realistic 60 minute minimum');
assert.ok(json.includes('Math.min(90'), 'wait time should not explode from demo/test backlog');
assert.ok(json.includes('lieferdienst_speisekarte'), 'workflow should read the menu table');
assert.ok(json.includes('lieferdienst_bestellungen'), 'workflow should use the orders table');
assert.ok(json.includes('hasParsedPositions || parsedIntent ==='), 'parsed orders must not be downgraded to info');
assert.ok(!json.includes('gross|nudel|pasta|spaghetti|penne|gluten'), 'pasta terms should not force info intent');
assert.ok(json.includes('MENU_PDF_URL'), 'workflow should still send a menu PDF for menu questions');

console.log('Clean Telegram workflow checks passed.');
