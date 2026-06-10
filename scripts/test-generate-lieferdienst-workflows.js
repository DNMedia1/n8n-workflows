#!/usr/bin/env node

const assert = require('node:assert/strict');
const { buildSetupWorkflow, buildTelegramWorkflow, menuItems } = require('./generate-lieferdienst-workflows');

const setup = buildSetupWorkflow();
const telegram = buildTelegramWorkflow();

assert.equal(setup.name, 'Lieferdienst Demo DB Setup');
assert.equal(telegram.name, 'Telegram Lieferdienst Bestellung Demo');

assert.ok(menuItems.length >= 12, 'demo menu should contain enough realistic items');
assert.ok(menuItems.every((item) => item.artikel_id && item.name && item.preis_eur > 0));
assert.ok(menuItems.some((item) => /pasta|nudel/i.test(`${item.kategorie} ${item.name}`)), 'demo menu should contain pasta/noodle items');
assert.ok(menuItems.some((item) => /glutenfrei/i.test(item.beschreibung)), 'demo menu should contain gluten-free test data');
assert.ok(menuItems.some((item) => /vegan/i.test(item.beschreibung)), 'demo menu should contain vegan test data');

const setupNodeTypes = new Set(setup.nodes.map((node) => node.type));
assert.ok(setupNodeTypes.has('n8n-nodes-base.dataTable'), 'setup workflow should use n8n Data Tables');

const setupNodeNames = new Set(setup.nodes.map((node) => node.name));
assert.ok(setupNodeNames.has('Speisekarte Tabelle anlegen'));
assert.ok(setupNodeNames.has('Bestellungen Tabelle anlegen'));
assert.ok(setupNodeNames.has('Speisekarte upserten'));

const telegramNodeNames = new Set(telegram.nodes.map((node) => node.name));
[
  'Telegram Trigger',
  'Hat Sprachnachricht?',
  'Voice Datei laden',
  'Voice Base64 vorbereiten',
  'OpenRouter Transkription',
  'Sprachfehler Antwort',
  'Speisekarte laden',
  'Offene Bestellungen laden',
  'OpenRouter Bestellung extrahieren',
  'Bestell-JSON parsen',
  'Lieferadresse geocodieren',
  'Route URL vorbereiten',
  'Route berechnen',
  'Bestellung speichern',
  'Unvollstaendige Bestellung speichern?',
  'Bestellentwurf speichern',
  'Slack Bestellnachricht bauen',
  'Slack Bestellung senden',
  'Telegram Antwort senden',
  'Speisekarte PDF senden?',
  'Telegram Speisekarte PDF senden',
].forEach((name) => assert.ok(telegramNodeNames.has(name), `missing node: ${name}`));

const dataTableNodes = telegram.nodes.filter((node) => node.type === 'n8n-nodes-base.dataTable');
assert.ok(
  dataTableNodes.some((node) => node.parameters?.dataTableId?.value === 'lieferdienst_speisekarte'),
  'telegram workflow should read the menu data table',
);
assert.ok(
  dataTableNodes.some((node) => node.parameters?.dataTableId?.value === 'lieferdienst_bestellungen'),
  'telegram workflow should use the orders data table',
);

const json = JSON.stringify(telegram);
assert.ok(!json.includes('OPENAI_API_KEY'), 'workflow should no longer require OPENAI_API_KEY');
assert.ok(!json.includes('api.openai.com'), 'workflow should no longer call OpenAI directly');
assert.ok(json.includes('OPENROUTER_API_KEY'), 'workflow should use OpenRouter key from env');
assert.ok(json.includes('SLACK_ORDERS_WEBHOOK_URL'), 'workflow should support an orders Slack webhook env var');
assert.ok(json.includes('SLACK_STEINOFENBOT_WEBHOOK_URL'), 'workflow should prefer a Steinofenbot Slack webhook env var');
assert.ok(json.includes('#steinofenbot'), 'workflow should target the Steinofenbot Slack channel when supported');
assert.ok(json.includes('MENU_PDF_URL'), 'workflow should support a restaurant-specific menu PDF URL');
assert.ok(json.includes('openai/whisper-1'), 'voice transcription should use OpenRouter Whisper model that handles Telegram OGG/OGA');
assert.ok(!json.includes('"language": "de"'), 'OpenRouter transcription should not send unsupported language field');
assert.ok(json.includes('continueErrorOutput'), 'voice transcription should route errors to a customer reply');
assert.ok(json.includes('Blenkerstr. 39, 76187 Karlsruhe'), 'restaurant address should be fixed');
assert.ok(json.includes('49.0404374'), 'restaurant latitude should be fixed from geocoding');
assert.ok(json.includes('8.3464520'), 'restaurant longitude should be fixed from geocoding');
assert.ok(json.includes('nominatim.openstreetmap.org/search'), 'workflow should geocode delivery address');
assert.ok(json.includes('router.project-osrm.org/route/v1/driving'), 'workflow should calculate route distance');
assert.ok(!json.includes('distanceFromText'), 'workflow should not ask customer for kilometers');
assert.ok(json.includes('intent = \\"info\\"'), 'workflow should support menu/info questions');
assert.ok(json.includes('Preise und Groessen'), 'workflow should answer pizza size questions without hardcoded size claims');
assert.ok(json.includes('Unsere Nudelgerichte'), 'workflow should answer noodle questions');
assert.ok(json.includes('glutenfrei'), 'workflow should answer gluten-free questions');
assert.ok(json.includes('vegan'), 'workflow should answer vegan questions');
assert.ok(json.includes('looksLikeInfoQuestion'), 'workflow should have deterministic info question fallback');
assert.ok(json.includes("hasParsedPositions || parsedIntent === 'order'"), 'parsed orders must not be downgraded to info answers');
assert.ok(!json.includes('gross|nudel|pasta|spaghetti|penne|gluten'), 'orderable pasta terms should not force info intent');
assert.ok(json.includes('sendDocument'), 'workflow should send the menu PDF on menu questions');
assert.ok(json.includes('"appendAttribution":false'), 'telegram replies should not append n8n attribution');
assert.ok(json.includes('Bestellung vollstaendig?'), 'workflow should still save complete orders only');
assert.ok(json.includes('Unvollstaendige Vorbestellung fuer diesen Telegram-Chat'), 'workflow should pass pending order context into the LLM');
assert.ok(json.includes('Bestellentwurf speichern'), 'workflow should save incomplete order drafts for follow-up messages');
assert.ok(json.includes('lieferdienst_speisekarte'), 'workflow should reference menu table by name');
assert.ok(json.includes('lieferdienst_bestellungen'), 'workflow should reference orders table by name');
assert.ok(json.includes('Neue Lieferdienst-Bestellung'), 'workflow should build an internal Slack order alert');
assert.ok(json.includes('Google Maps'), 'Slack alert should include a map link for the delivery address');

console.log('Lieferdienst workflow generator checks passed.');
