#!/usr/bin/env node

/*
 * Baut eine deutlich schlankere Version des Telegram-Lieferdienst-Workflows.
 *
 * Prinzip:
 * - Telegram/Voice nur als Eingangsadapter
 * - ein normalisierter Text geht in den Bestellkern
 * - der Kern entscheidet: Info, unvollstaendige Bestellung, komplette Bestellung
 * - Ausgaenge: Telegram-Antwort, optional PDF, optional DB, optional Slack
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const root = path.resolve(__dirname, '..');
const liveWorkflowId = 'gGYPV28ggPpGlgLf';
const liveBaseUrl = 'https://srv1651618.hstgr.cloud/api/v1';
const localFiles = [
  'n8n-telegram-lieferdienst-workflow.json',
  'n8n-telegram-lieferdienst-workflow-v2-hotfix.json',
  'n8n-telegram-lieferdienst-workflow-clean.json',
];

const orderColumns = [
  { name: 'bestell_id', type: 'string' },
  { name: 'chat_id', type: 'string' },
  { name: 'kunde_name', type: 'string' },
  { name: 'adresse', type: 'string' },
  { name: 'artikel_text', type: 'string' },
  { name: 'gesamtpreis_eur', type: 'number' },
  { name: 'entfernung_km', type: 'number' },
  { name: 'wartezeit_min', type: 'number' },
  { name: 'status', type: 'string' },
  { name: 'created_at', type: 'date' },
  { name: 'raw_text', type: 'string' },
];

function dataTableId(name) {
  return { __rl: true, value: name, mode: 'name' };
}

function schemaFor(fields) {
  return fields.map(({ name, type = 'string' }) => ({
    id: name,
    displayName: name,
    required: false,
    defaultMatch: false,
    display: true,
    type,
    canBeUsedToMatch: true,
  }));
}

function codeNode(id, name, jsCode, position) {
  return {
    parameters: { jsCode },
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function ifNode(id, name, leftValue, rightValue, position) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: `${id}-condition`,
            leftValue,
            rightValue,
            operator: { type: 'string', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function getRowsNode(id, name, tableName, position, alwaysOutputData = false) {
  return {
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: dataTableId(tableName),
      returnAll: true,
    },
    id,
    name,
    type: 'n8n-nodes-base.dataTable',
    typeVersion: 1.1,
    position,
    ...(alwaysOutputData ? { alwaysOutputData: true } : {}),
  };
}

function telegramMessageNode(id, name, chatId, text, position) {
  return {
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId,
      text,
      additionalFields: { appendAttribution: false },
    },
    id,
    name,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position,
  };
}

function telegramDocumentNode(id, name, chatId, file, caption, position) {
  return {
    parameters: {
      resource: 'message',
      operation: 'sendDocument',
      chatId,
      binaryData: false,
      file,
      additionalFields: { caption },
    },
    id,
    name,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position,
  };
}

const normalizeTelegramCode = `const update = $json;
const message = update.message ?? update.edited_message ?? {};
const chat = message.chat ?? {};
const from = message.from ?? {};
const voiceFileId = message.voice?.file_id ?? message.audio?.file_id ?? '';
const text = message.text ?? message.caption ?? '';

return [{
  json: {
    source: 'telegram',
    reply_mode: 'telegram',
    chat_id: String(chat.id ?? ''),
    customer_first_name: from.first_name ?? '',
    customer_last_name: from.last_name ?? '',
    username: from.username ?? '',
    message_text: String(text || '').trim(),
    voice_file_id: voiceFileId,
    has_voice: Boolean(voiceFileId)
  }
}];`;

const textAdapterCode = `return [{
  json: {
    ...$json,
    input_type: 'text',
    order_text: String($json.message_text || '').trim()
  }
}];`;

const voiceBase64Code = `const ctx = $('Telegram Nachricht normalisieren').first().json;
const item = $input.first();
const bin = item.binary?.data;
if (!bin) throw new Error('Voice-Datei fehlt: keine Binary-Property "data" vorhanden.');

const buffer = await this.helpers.getBinaryDataBuffer(0, 'data');
const mimeType = bin.mimeType || 'audio/ogg';
const fileName = bin.fileName || '';
const format =
  mimeType.includes('webm') || fileName.endsWith('.webm') ? 'webm' :
  mimeType.includes('mpeg') || mimeType.includes('mp3') || fileName.endsWith('.mp3') ? 'mp3' :
  mimeType.includes('wav') || fileName.endsWith('.wav') ? 'wav' :
  mimeType.includes('flac') || fileName.endsWith('.flac') ? 'flac' :
  mimeType.includes('mp4') || fileName.endsWith('.mp4') ? 'mp4' :
  'ogg';

return [{
  json: {
    ...ctx,
    voice_audio: { data: buffer.toString('base64'), format }
  }
}];`;

const voiceTextCode = `const ctx = $('Voice Audio vorbereiten').first().json;
const transcript = $json.text ?? $json.transcript ?? $json.data?.text ?? '';

return [{
  json: {
    ...ctx,
    input_type: 'voice',
    transcription: String(transcript || '').trim(),
    order_text: String(transcript || '').trim()
  }
}];`;

const promptCode = `const ctx = $('Nachricht vereinheitlichen').first().json;
const menu = $('Speisekarte laden').all()
  .map((item) => item.json)
  .filter((item) => item && item.artikel_id);
const orders = $input.all()
  .map((item) => item.json)
  .filter((row) => row && row.bestell_id);

const openOrders = orders.filter((row) => String(row.status || '').toLowerCase() === 'offen');
const pendingOrder = orders
  .filter((row) => String(row.chat_id || '') === String(ctx.chat_id || ''))
  .filter((row) => String(row.status || '').toLowerCase() === 'unvollstaendig')
  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;

function text(value) {
  return String(value ?? '').trim();
}

const menuText = menu.map((item) => {
  const variantText = text(item.varianten || item.groessen || item.optionen);
  return [
    item.artikel_id,
    item.name,
    item.kategorie,
    Number(item.preis_eur).toFixed(2) + ' EUR',
    'Zubereitung ca. ' + (Number(item.vorbereitung_min) || 12) + ' min',
    item.verfuegbar ? 'verfuegbar' : 'nicht verfuegbar',
    text(item.beschreibung),
    variantText ? 'Varianten: ' + variantText : ''
  ].filter(Boolean).join(' | ');
}).join('\\n');

const pendingText = pendingOrder
  ? [
      'Bisherige unvollstaendige Bestellung:',
      'Bestellnummer: ' + text(pendingOrder.bestell_id),
      'Artikel: ' + text(pendingOrder.artikel_text),
      'Adresse: ' + text(pendingOrder.adresse),
      'Original: ' + text(pendingOrder.raw_text)
    ].join('\\n')
  : 'Keine.';

const systemPrompt = [
  'Du bist der Bestellassistent eines Lieferdienstes.',
  'Deine Aufgabe: Kundennachricht als Infofrage oder Bestellung klassifizieren und strukturiert extrahieren.',
  'Nutze ausschliesslich Artikel aus der Speisekarte und deren artikel_id.',
  'Erfinde keine Artikel, Preise, Adressen oder Telefonnummern.',
  'intent = "info" nur, wenn der Kunde nur nach Speisekarte, Sortiment, Preisen, Groessen, Lieferung, Oeffnungszeiten oder Allergenen fragt.',
  'intent = "order", sobald der Kunde Essen oder Getraenke bestellen moechte.',
  'Wenn eine unvollstaendige Bestellung vorhanden ist, fuehre neue Angaben damit zusammen.',
  'Normalisiere deutsche Ortsnamen und Adressen sorgfaeltig. In der Region Karlsruhe bedeutet Eckstein/Eckenstein/Eckestein meist Eggenstein.',
  'Normalisiere Leopardshafen/Leopartshafen zu Leopoldshafen und schreibe den Ort als Eggenstein-Leopoldshafen.',
  'Normalisiere einzeln gesprochene Postleitzahlen wie 7 6 3 4 4 zu 76344.',
  'Telefonnummer und Kundenname sind optional.',
  'Wenn Adresse oder Artikel fehlen, schreibe sie in fehlende_infos.',
  'Antworte nur mit validem JSON ohne Markdown.',
  '',
  'JSON-Format:',
  '{',
  '  "intent": "order | info",',
  '  "info_topic": "speisekarte | preise | groessen | lieferung | allergene | allgemein | leer",',
  '  "antwort": "kurz bei info, sonst leer",',
  '  "kunde_name": "",',
  '  "telefon": "",',
  '  "adresse": "",',
  '  "positionen": [{ "artikel_id": "PIZZA_SALAMI", "menge": 1, "sonderwunsch": "" }],',
  '  "fehlende_infos": [],',
  '  "notizen": ""',
  '}'
].join('\\n');

const userMessage = [
  'Speisekarte:',
  menuText,
  '',
  'Aktuell offene Bestellungen: ' + openOrders.length,
  '',
  pendingText,
  '',
  'Kundennachricht:',
  text(ctx.order_text) || '(leer)'
].join('\\n');

return [{
  json: {
    ...ctx,
    menu,
    open_orders_count: openOrders.length,
    pending_order: pendingOrder,
    system_prompt: systemPrompt,
    user_message: userMessage
  }
}];`;

const buildReplyCode = `const ctx = $('Bestellassistent Prompt bauen').first().json;
const rawContent = $json?.choices?.[0]?.message?.content ?? '';

function text(value) {
  return String(value ?? '').trim();
}

function parseJson(raw) {
  try {
    const clean = String(raw).replace(/^\\\`\\\`\\\`json/i, '').replace(/^\\\`\\\`\\\`/i, '').replace(/\\\`\\\`\\\`$/i, '').trim();
    return JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  } catch (error) {
    return {
      intent: 'info',
      info_topic: 'allgemein',
      antwort: 'Ich habe deine Nachricht nicht sicher verstanden. Du kannst nach der Speisekarte fragen oder direkt deine Bestellung mit Lieferadresse senden.',
      kunde_name: '',
      telefon: '',
      adresse: '',
      positionen: [],
      fehlende_infos: [],
      notizen: 'JSON parsing failed: ' + String(error.message || error)
    };
  }
}

const parsed = parseJson(rawContent);
const menu = Array.isArray(ctx.menu) ? ctx.menu : [];
const menuById = new Map(menu.map((item) => [text(item.artikel_id).toUpperCase(), item]));
const parsedPositions = Array.isArray(parsed.positionen) ? parsed.positionen : [];
const hasParsedPositions = parsedPositions.some((position) => text(position.artikel_id));
const parsedIntent = text(parsed.intent).toLowerCase();
const rawText = text(ctx.order_text).toLowerCase();

function looksLikeInfoQuestion() {
  const hasInfoSignal = /\\?|speisekarte|karte|sortiment|angebot|groess|größe|gross|preis|preise|allergen|gluten|vegan|vegetarisch|liefer|oeffnung|öffnung|habt ihr|gibt es|welche/.test(rawText);
  const hasOrderSignal = /\\b(bestelle|bestellen|bestellung|nehme|nehmen|nimm|haette gern|hätte gern|haette gerne|hätte gerne|ich will|ich moechte|ich möchte|einmal|zweimal|1x|2x|3x)\\b/.test(rawText);
  return hasInfoSignal && !hasOrderSignal;
}

function shouldSendMenuPdf(topic) {
  return /speisekarte|karte|sortiment|angebot|preis|preise|groess|größe|gross/.test(rawText) || /speisekarte|preise|groessen/.test(topic);
}

function menuLines(predicate) {
  return menu
    .filter(predicate)
    .slice(0, 20)
    .map((item) => '- ' + item.name + ' (' + Number(item.preis_eur || 0).toFixed(2) + ' EUR)')
    .join('\\n');
}

function infoReply(topic) {
  const answer = text(parsed.antwort);
  if (/speisekarte|preise|groessen/.test(topic) || shouldSendMenuPdf(topic)) {
    return [
      'Ich schicke dir die Speisekarte als PDF mit.',
      '',
      'Wenn du bestellen moechtest, sende mir einfach Artikel, Menge und Lieferadresse.'
    ].join('\\n');
  }
  if (/liefer/.test(topic)) {
    return [
      'Wir liefern ab Blenkerstr. 39, 76187 Karlsruhe.',
      'Sende mir fuer eine Bestellung bitte Artikel und Lieferadresse.'
    ].join('\\n');
  }
  if (/allergen|gluten|vegan|vegetarisch/.test(topic + ' ' + rawText)) {
    const lines = menuLines((item) => /gluten|vegan|vegetarisch/i.test(text(item.beschreibung)));
    return lines || 'Dazu habe ich in den aktuellen Speisekarten-Daten keine gesicherten Informationen.';
  }
  return answer || 'Ich kann dir bei Speisekarte, Preisen, Lieferung und Bestellungen helfen.';
}

function normalizeAddress(value) {
  let address = text(value);
  if (!address) return '';

  address = address.replace(/\\b(\\d)\\s+(\\d)\\s+(\\d)\\s+(\\d)\\s+(\\d)\\b/g, '$1$2$3$4$5');
  address = address.replace(/\\b(eckenstein|eckestein|eckstein)\\b/gi, 'Eggenstein');
  address = address.replace(/\\b(leopardshafen|leopartshafen|leopolshafen)\\b/gi, 'Leopoldshafen');
  address = address.replace(/\\bEggenstein[\\s,-]+Leopoldshafen\\b/gi, 'Eggenstein-Leopoldshafen');
  address = address.replace(/\\b76344\\s+Eggenstein(?:-| )Leopoldshafen\\b/gi, '76344 Eggenstein-Leopoldshafen');
  address = address.replace(/\\s+/g, ' ').trim();

  return address;
}

const intent = hasParsedPositions || parsedIntent === 'order'
  ? 'order'
  : (parsedIntent === 'info' || looksLikeInfoQuestion() ? 'info' : 'order');
const topic = text(parsed.info_topic).toLowerCase();

const createdAt = new Date().toISOString();
const customerName = text(parsed.kunde_name) ||
  [ctx.customer_first_name, ctx.customer_last_name].filter(Boolean).join(' ').trim() ||
  'Telegram Kunde';

if (intent === 'info') {
  return [{
    json: {
      bestell_id: '',
      chat_id: ctx.chat_id,
      kunde_name: customerName,
      telefon: '',
      adresse: '',
      positionen: [],
      artikel_text: '',
      gesamtpreis_eur: 0,
      entfernung_km: 0,
      route_minuten: 0,
      offene_bestellungen: Number(ctx.open_orders_count || 0),
      wartezeit_min: 0,
      wartezeit_text: '',
      status: 'info',
      complete: false,
      save_order: false,
      send_slack: false,
      should_send_menu_pdf: shouldSendMenuPdf(topic),
      raw_text: ctx.order_text,
      input_type: ctx.input_type,
      telegram_reply: infoReply(topic),
      slack_text: '',
      llm_raw: rawContent.slice(0, 1000),
      created_at: createdAt
    }
  }];
}

const resolved = [];
const missing = Array.isArray(parsed.fehlende_infos)
  ? parsed.fehlende_infos
      .map(text)
      .filter(Boolean)
      .filter((entry) => !/^(telefon|telefonnummer|rufnummer|kunde|kundenname|kunde_name|name)$/i.test(entry))
  : [];
let total = 0;
let maxPrep = 12;
let itemCount = 0;

for (const position of parsedPositions) {
  const id = text(position.artikel_id).toUpperCase();
  const menuItem = menuById.get(id);
  const qty = Math.max(1, Math.round(Number(position.menge || 1)));
  if (!menuItem) {
    missing.push('Artikel nicht sicher erkannt: ' + (id || 'unbekannt'));
    continue;
  }
  if (menuItem.verfuegbar === false || String(menuItem.verfuegbar).toLowerCase() === 'false') {
    missing.push('Artikel ist aktuell nicht verfuegbar: ' + menuItem.name);
    continue;
  }
  const lineTotal = Number(menuItem.preis_eur || 0) * qty;
  total += lineTotal;
  itemCount += qty;
  maxPrep = Math.max(maxPrep, Number(menuItem.vorbereitung_min) || 12);
  resolved.push({
    artikel_id: id,
    name: menuItem.name,
    menge: qty,
    einzelpreis_eur: Number(menuItem.preis_eur || 0),
    gesamtpreis_eur: Number(lineTotal.toFixed(2)),
    sonderwunsch: text(position.sonderwunsch)
  });
}

const address = normalizeAddress(parsed.adresse);
if (!address) missing.push('Lieferadresse');
if (resolved.length === 0) missing.push('Bestellpositionen');

const uniqueMissing = Array.from(new Set(missing));
const openOrders = Number(ctx.open_orders_count || 0);
const effectiveOpenOrders = Math.min(Math.max(openOrders, 0), 4);
const deliveryBuffer = address ? 25 : 0;
const loadSurcharge = effectiveOpenOrders * 5;
const extraItemSurcharge = Math.max(0, itemCount - 3) * 2;
const deliveryMinimum = address ? 60 : 20;
const rawWaitMinutes = maxPrep + deliveryBuffer + loadSurcharge + extraItemSurcharge;
const waitMinutes = Math.min(90, Math.max(deliveryMinimum, Math.round(rawWaitMinutes / 5) * 5));
const waitRange = waitMinutes + '-' + (waitMinutes + 10);
const complete = uniqueMissing.length === 0;
const status = complete ? 'offen' : 'unvollstaendig';
const bestellId = 'LD-' + createdAt.replace(/[-:.TZ]/g, '').slice(0, 14);
const itemLines = resolved.map((item) => item.menge + 'x ' + item.name + (item.sonderwunsch ? ' (' + item.sonderwunsch + ')' : ''));

const telegramReply = complete
  ? [
      'Danke, deine Bestellung ist eingegangen.',
      '',
      'Bestellnummer: ' + bestellId,
      itemLines.join('\\n'),
      '',
      'Gesamtpreis: ' + total.toFixed(2) + ' EUR',
      'Lieferadresse: ' + address,
      'Voraussichtliche Wartezeit: ca. ' + waitRange + ' Minuten'
    ].join('\\n')
  : [
      'Danke, ich habe deine Bestellung teilweise erkannt.',
      '',
      resolved.length ? 'Erkannt:\\n' + itemLines.join('\\n') : 'Erkannte Artikel: keine sicheren Treffer',
      '',
      'Mir fehlt noch:',
      ...uniqueMissing.map((entry) => '- ' + entry),
      '',
      'Bitte sende die fehlenden Angaben als Text oder Sprachnachricht.'
    ].join('\\n');

const mapQuery = encodeURIComponent(address);
const slackText = [
  '*Neue Steinofen-Bestellung*',
  '',
  '*Bestellnummer:* ' + bestellId,
  '*Kunde:* ' + customerName,
  text(parsed.telefon) ? '*Telefon:* ' + text(parsed.telefon) : '',
  '',
  '*Bestellung:*',
  itemLines.map((line) => '- ' + line).join('\\n'),
  '',
  '*Gesamtpreis:* ' + total.toFixed(2) + ' EUR',
  '*Adresse:* ' + address,
  mapQuery ? 'Google Maps: https://www.google.com/maps/search/?api=1&query=' + mapQuery : '',
  '*Wartezeit:* ca. ' + waitRange + ' Minuten',
  '',
  '*Originalnachricht:*',
  text(ctx.order_text) || 'Nicht vorhanden'
].filter(Boolean).join('\\n');

return [{
  json: {
    bestell_id: bestellId,
    chat_id: ctx.chat_id,
    kunde_name: customerName,
    telefon: text(parsed.telefon),
    adresse: address,
    positionen: resolved,
    artikel_text: itemLines.join('; '),
    gesamtpreis_eur: Number(total.toFixed(2)),
    entfernung_km: 0,
    route_minuten: 0,
    offene_bestellungen: openOrders,
    wartezeit_min: waitMinutes,
    wartezeit_text: waitRange + ' Minuten',
    status,
    complete,
    save_order: Boolean(resolved.length || address),
    send_slack: complete,
    missing: uniqueMissing,
    raw_text: ctx.order_text,
    input_type: ctx.input_type,
    telegram_reply: telegramReply,
    should_send_menu_pdf: false,
    slack_text: slackText,
    llm_raw: rawContent.slice(0, 1000),
    created_at: createdAt
  }
}];`;

function buildCleanWorkflow() {
  const nodes = [
    {
      parameters: {
        content: [
          '## Steinofen Bot - sauberer Kern',
          '',
          '1. Telegram/Voice wird zu Text normalisiert.',
          '2. Der Bestellkern liest Speisekarte + offene Bestellungen.',
          '3. Antwort, DB-Speicherung, Slack und PDF laufen als klare Ausgaenge.',
          '',
          'Env:',
          '- OPENROUTER_API_KEY',
          '- SLACK_STEINOFENBOT_WEBHOOK_URL fuer #test-channel-steinofen-bot',
          '- MENU_PDF_URL optional'
        ].join('\\n'),
        height: 280,
        width: 420,
      },
      id: 'workflow-note',
      name: 'Workflow Hinweis',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [120, 80],
    },
    {
      parameters: { updates: ['message'], additionalFields: {} },
      id: 'telegram-trigger',
      name: 'Telegram Trigger',
      type: 'n8n-nodes-base.telegramTrigger',
      typeVersion: 1.3,
      position: [120, 420],
    },
    codeNode('normalize-telegram', 'Telegram Nachricht normalisieren', normalizeTelegramCode, [380, 420]),
    ifNode('if-voice', 'Voice?', '={{ String($json.has_voice) }}', 'true', [640, 420]),
    {
      parameters: {
        resource: 'file',
        operation: 'get',
        fileId: '={{ $json.voice_file_id }}',
        download: true,
        additionalFields: { mimeType: 'audio/ogg' },
      },
      id: 'telegram-file',
      name: 'Telegram Voice laden',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [900, 260],
    },
    codeNode('voice-base64', 'Voice Audio vorbereiten', voiceBase64Code, [1160, 260]),
    {
      parameters: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/audio/transcriptions',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: '=Bearer {{$env.OPENROUTER_API_KEY}}' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'HTTP-Referer', value: 'https://your-domain.de' },
            { name: 'X-Title', value: 'Steinofen Telegram Bot' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "model": "openai/whisper-1", "input_audio": $json.voice_audio } }}',
        options: { timeout: 60000 },
      },
      id: 'openrouter-transcription',
      name: 'OpenRouter Voice transkribieren',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1420, 260],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
      onError: 'continueErrorOutput',
    },
    codeNode('voice-text', 'Voice als Text', voiceTextCode, [1680, 260]),
    telegramMessageNode(
      'voice-error-reply',
      'Sprachfehler Antwort',
      "={{ $('Telegram Nachricht normalisieren').first().json.chat_id }}",
      'Entschuldigung, ich konnte deine Sprachnachricht gerade nicht verarbeiten. Bitte sende deine Bestellung kurz als Text.',
      [1680, 80],
    ),
    codeNode('text-adapter', 'Text als Text', textAdapterCode, [900, 560]),
    {
      parameters: { mode: 'append', numberInputs: 2 },
      id: 'merge-message',
      name: 'Nachricht vereinheitlichen',
      type: 'n8n-nodes-base.merge',
      typeVersion: 3.2,
      position: [1940, 420],
    },
    getRowsNode('menu-get', 'Speisekarte laden', 'lieferdienst_speisekarte', [2200, 420]),
    getRowsNode('orders-get', 'Bestellungen laden', 'lieferdienst_bestellungen', [2460, 420], true),
    codeNode('prompt-build', 'Bestellassistent Prompt bauen', promptCode, [2720, 420]),
    {
      parameters: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Authorization', value: '=Bearer {{$env.OPENROUTER_API_KEY}}' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'HTTP-Referer', value: 'https://your-domain.de' },
            { name: 'X-Title', value: 'Steinofen Telegram Bot' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody:
          '={{ { "model": "meta-llama/llama-3.3-70b-instruct", "temperature": 0.1, "response_format": { "type": "json_object" }, "messages": [{ "role": "system", "content": $json.system_prompt }, { "role": "user", "content": $json.user_message }] } }}',
        options: { timeout: 30000 },
      },
      id: 'openrouter-order',
      name: 'OpenRouter Bestellung verstehen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2980, 420],
    },
    codeNode('reply-build', 'Bestellantwort bauen', buildReplyCode, [3240, 420]),
    ifNode('if-save-order', 'Bestellung speichern?', '={{ String($json.save_order) }}', 'true', [3500, 280]),
    {
      parameters: {
        resource: 'row',
        operation: 'insert',
        dataTableId: dataTableId('lieferdienst_bestellungen'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            bestell_id: '={{ $json.bestell_id }}',
            chat_id: '={{ $json.chat_id }}',
            kunde_name: '={{ $json.kunde_name }}',
            adresse: '={{ $json.adresse }}',
            artikel_text: '={{ $json.artikel_text }}',
            gesamtpreis_eur: '={{ $json.gesamtpreis_eur }}',
            entfernung_km: '={{ $json.entfernung_km }}',
            wartezeit_min: '={{ $json.wartezeit_min }}',
            status: '={{ $json.status }}',
            created_at: '={{ $json.created_at }}',
            raw_text: '={{ $json.raw_text }}',
          },
          schema: schemaFor(orderColumns),
          attemptToConvertTypes: true,
          convertFieldsToString: false,
        },
        options: {},
      },
      id: 'insert-order',
      name: 'Bestellung speichern',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [3760, 280],
    },
    ifNode(
      'if-slack',
      'Slack senden?',
      '={{ String($json.send_slack && Boolean($env.SLACK_STEINOFENBOT_WEBHOOK_URL || $env.SLACK_ORDERS_WEBHOOK_URL)) }}',
      'true',
      [3500, 420],
    ),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.SLACK_STEINOFENBOT_WEBHOOK_URL || $env.SLACK_ORDERS_WEBHOOK_URL }}',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "text": $json.slack_text, "channel": $env.SLACK_ORDERS_CHANNEL || "#test-channel-steinofen-bot" } }}',
        options: {},
      },
      id: 'slack-send',
      name: 'Slack Bestellung senden',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3760, 420],
      continueOnFail: true,
    },
    telegramMessageNode(
      'telegram-reply',
      'Telegram Antwort senden',
      '={{ $json.chat_id }}',
      '={{ $json.telegram_reply }}',
      [3500, 600],
    ),
    ifNode('if-menu-pdf', 'Speisekarte PDF senden?', "={{ String($('Bestellantwort bauen').first().json.should_send_menu_pdf) }}", 'true', [3760, 600]),
    telegramDocumentNode(
      'telegram-menu-pdf',
      'Telegram Speisekarte PDF senden',
      "={{ $('Bestellantwort bauen').first().json.chat_id }}",
      "={{ $env.MENU_PDF_URL || 'https://weur-cdn.speisekarte.menu/storage/media/companies_menu_pdf/114411922/steinofen-pizzeria-karlsruhe-speisekarte.pdf' }}",
      'Hier ist die Speisekarte als PDF. Preise und Verfuegbarkeit koennen sich aendern.',
      [4020, 600],
    ),
  ];

  return {
    name: 'Telegram Lieferdienst Bestellung Demo',
    nodes,
    connections: {
      'Telegram Trigger': { main: [[{ node: 'Telegram Nachricht normalisieren', type: 'main', index: 0 }]] },
      'Telegram Nachricht normalisieren': { main: [[{ node: 'Voice?', type: 'main', index: 0 }]] },
      'Voice?': {
        main: [
          [{ node: 'Telegram Voice laden', type: 'main', index: 0 }],
          [{ node: 'Text als Text', type: 'main', index: 0 }],
        ],
      },
      'Telegram Voice laden': { main: [[{ node: 'Voice Audio vorbereiten', type: 'main', index: 0 }]] },
      'Voice Audio vorbereiten': { main: [[{ node: 'OpenRouter Voice transkribieren', type: 'main', index: 0 }]] },
      'OpenRouter Voice transkribieren': {
        main: [
          [{ node: 'Voice als Text', type: 'main', index: 0 }],
          [{ node: 'Sprachfehler Antwort', type: 'main', index: 0 }],
        ],
      },
      'Voice als Text': { main: [[{ node: 'Nachricht vereinheitlichen', type: 'main', index: 0 }]] },
      'Text als Text': { main: [[{ node: 'Nachricht vereinheitlichen', type: 'main', index: 1 }]] },
      'Nachricht vereinheitlichen': { main: [[{ node: 'Speisekarte laden', type: 'main', index: 0 }]] },
      'Speisekarte laden': { main: [[{ node: 'Bestellungen laden', type: 'main', index: 0 }]] },
      'Bestellungen laden': { main: [[{ node: 'Bestellassistent Prompt bauen', type: 'main', index: 0 }]] },
      'Bestellassistent Prompt bauen': { main: [[{ node: 'OpenRouter Bestellung verstehen', type: 'main', index: 0 }]] },
      'OpenRouter Bestellung verstehen': { main: [[{ node: 'Bestellantwort bauen', type: 'main', index: 0 }]] },
      'Bestellantwort bauen': {
        main: [
          [
            { node: 'Bestellung speichern?', type: 'main', index: 0 },
            { node: 'Slack senden?', type: 'main', index: 0 },
            { node: 'Telegram Antwort senden', type: 'main', index: 0 },
          ],
        ],
      },
      'Bestellung speichern?': { main: [[{ node: 'Bestellung speichern', type: 'main', index: 0 }], []] },
      'Slack senden?': { main: [[{ node: 'Slack Bestellung senden', type: 'main', index: 0 }], []] },
      'Telegram Antwort senden': { main: [[{ node: 'Speisekarte PDF senden?', type: 'main', index: 0 }]] },
      'Speisekarte PDF senden?': { main: [[{ node: 'Telegram Speisekarte PDF senden', type: 'main', index: 0 }], []] },
    },
    pinData: {},
    active: false,
    settings: { executionOrder: 'v1' },
    versionId: 'telegram-lieferdienst-clean-v1',
  };
}

function copyLiveCredentials(clean, live) {
  const telegramCreds =
    live.nodes.find((node) => node.name === 'Telegram Antwort senden')?.credentials ||
    live.nodes.find((node) => node.name === 'Telegram Trigger')?.credentials ||
    live.nodes.find((node) => node.type === 'n8n-nodes-base.telegram')?.credentials;

  if (!telegramCreds) return;
  for (const node of clean.nodes) {
    if (node.type === 'n8n-nodes-base.telegram' || node.type === 'n8n-nodes-base.telegramTrigger') {
      node.credentials = telegramCreds;
    }
  }
}

function validate(workflow) {
  const json = JSON.stringify(workflow);
  const checks = [
    ['node count <= 24', workflow.nodes.length <= 24],
    ['normalizer', json.includes('Telegram Nachricht normalisieren')],
    ['single core', json.includes('Bestellassistent Prompt bauen') && json.includes('Bestellantwort bauen')],
    ['no route nodes', !json.includes('Lieferadresse geocodieren') && !json.includes('Route berechnen')],
    ['voice model', json.includes('openai/whisper-1')],
    ['menu PDF', json.includes('sendDocument') && json.includes('MENU_PDF_URL')],
    ['slack target', json.includes('SLACK_STEINOFENBOT_WEBHOOK_URL') && json.includes('#test-channel-steinofen-bot')],
    ['data tables', json.includes('lieferdienst_speisekarte') && json.includes('lieferdienst_bestellungen')],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) throw new Error(`Validierung fehlgeschlagen: ${failed.map(([name]) => name).join(', ')}`);
}

function writeLocal(workflow) {
  for (const file of localFiles) {
    fs.writeFileSync(path.join(root, file), `${JSON.stringify(workflow, null, 2)}\n`);
    console.log('local', file, workflow.nodes.length);
  }
}

function request(method, urlPath, body) {
  const key = fs.readFileSync(path.join(root, 'secrets', 'n8n-api-key'), 'utf8').trim();
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      liveBaseUrl + urlPath,
      {
        method,
        headers: {
          'X-N8N-API-KEY': key,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data || '{}');
          } catch {
            json = { _raw: data.slice(0, 500) };
          }
          resolve({ code: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function patchLive(workflow) {
  const liveRes = await request('GET', `/workflows/${liveWorkflowId}`);
  if (liveRes.code < 200 || liveRes.code >= 300 || !Array.isArray(liveRes.json.nodes)) {
    throw new Error(`Live-Workflow konnte nicht geladen werden: HTTP ${liveRes.code}`);
  }

  const live = liveRes.json;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupDir = path.join(root, 'backups', ts);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'live-before-clean-workflow.json'), `${JSON.stringify(live, null, 2)}\n`);

  const clean = JSON.parse(JSON.stringify(workflow));
  copyLiveCredentials(clean, live);
  validate(clean);

  const body = {
    name: live.name,
    nodes: clean.nodes,
    connections: clean.connections,
    settings: { executionOrder: live.settings?.executionOrder || 'v1' },
  };

  const updateRes = await request('PUT', `/workflows/${liveWorkflowId}`, body);
  if (updateRes.code < 200 || updateRes.code >= 300) {
    throw new Error(`PUT fehlgeschlagen: HTTP ${updateRes.code} ${JSON.stringify(updateRes.json).slice(0, 300)}`);
  }

  console.log('live backup', path.relative(root, path.join(backupDir, 'live-before-clean-workflow.json')));
  console.log('live updated', updateRes.code, clean.nodes.length);
}

async function main() {
  const workflow = buildCleanWorkflow();
  validate(workflow);
  writeLocal(workflow);
  if (process.argv.includes('--live')) await patchLive(workflow);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { buildCleanWorkflow };
