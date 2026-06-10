#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const menuItems = [
  {
    artikel_id: 'PIZZA_MARGHERITA',
    kategorie: 'Pizza',
    name: 'Pizza Margherita',
    beschreibung: 'Tomatensauce, Mozzarella, Basilikum',
    preis_eur: 8.9,
    vorbereitung_min: 14,
    verfuegbar: true,
  },
  {
    artikel_id: 'PIZZA_SALAMI',
    kategorie: 'Pizza',
    name: 'Pizza Salami',
    beschreibung: 'Tomatensauce, Mozzarella, Salami',
    preis_eur: 10.9,
    vorbereitung_min: 16,
    verfuegbar: true,
  },
  {
    artikel_id: 'PIZZA_FUNGHI',
    kategorie: 'Pizza',
    name: 'Pizza Funghi',
    beschreibung: 'Tomatensauce, Mozzarella, Champignons',
    preis_eur: 10.5,
    vorbereitung_min: 16,
    verfuegbar: true,
  },
  {
    artikel_id: 'PIZZA_DIAVOLO',
    kategorie: 'Pizza',
    name: 'Pizza Diavolo',
    beschreibung: 'Tomatensauce, Mozzarella, scharfe Salami, Peperoni',
    preis_eur: 12.5,
    vorbereitung_min: 18,
    verfuegbar: true,
  },
  {
    artikel_id: 'PASTA_NAPOLI',
    kategorie: 'Pasta',
    name: 'Pasta Napoli',
    beschreibung: 'Penne mit Tomatensauce und Basilikum, vegetarisch, enthaelt Gluten',
    preis_eur: 8.7,
    vorbereitung_min: 13,
    verfuegbar: true,
  },
  {
    artikel_id: 'PASTA_CARBONARA',
    kategorie: 'Pasta',
    name: 'Pasta Carbonara',
    beschreibung: 'Penne mit Sahnesauce, Speck und Parmesan, enthaelt Gluten',
    preis_eur: 10.8,
    vorbereitung_min: 15,
    verfuegbar: true,
  },
  {
    artikel_id: 'PASTA_ARRABBIATA_VEGAN',
    kategorie: 'Pasta',
    name: 'Pasta Arrabbiata Vegan',
    beschreibung: 'Penne mit scharfer Tomatensauce, Knoblauch und Chili, vegan, enthaelt Gluten',
    preis_eur: 9.6,
    vorbereitung_min: 14,
    verfuegbar: true,
  },
  {
    artikel_id: 'PASTA_PESTO_VERDE',
    kategorie: 'Pasta',
    name: 'Pasta Pesto Verde',
    beschreibung: 'Spaghetti mit Basilikum-Pesto, vegetarisch, enthaelt Gluten',
    preis_eur: 10.4,
    vorbereitung_min: 14,
    verfuegbar: true,
  },
  {
    artikel_id: 'PASTA_GLUTENFREI_POMODORO',
    kategorie: 'Pasta',
    name: 'Glutenfreie Pasta Pomodoro',
    beschreibung: 'Glutenfreie Penne mit Tomatensauce und Basilikum, glutenfrei, vegan',
    preis_eur: 11.2,
    vorbereitung_min: 16,
    verfuegbar: true,
  },
  {
    artikel_id: 'PIZZA_VERDURA_VEGAN',
    kategorie: 'Pizza',
    name: 'Pizza Verdura Vegan',
    beschreibung: 'Tomatensauce, Zucchini, Paprika, Champignons, veganer Kaese, vegan',
    preis_eur: 12.9,
    vorbereitung_min: 18,
    verfuegbar: true,
  },
  {
    artikel_id: 'BURGER_CLASSIC',
    kategorie: 'Burger',
    name: 'Classic Burger',
    beschreibung: 'Rindfleisch, Salat, Tomate, Gurke, Burgersauce',
    preis_eur: 11.9,
    vorbereitung_min: 17,
    verfuegbar: true,
  },
  {
    artikel_id: 'BURGER_CHICKEN',
    kategorie: 'Burger',
    name: 'Chicken Burger',
    beschreibung: 'Knuspriges Haehnchen, Salat, Tomate, Mayo',
    preis_eur: 10.9,
    vorbereitung_min: 16,
    verfuegbar: true,
  },
  {
    artikel_id: 'SALAT_CHICKEN',
    kategorie: 'Salat',
    name: 'Chicken Salat',
    beschreibung: 'Blattsalat, Haehnchenstreifen, Tomate, Gurke, Dressing',
    preis_eur: 9.8,
    vorbereitung_min: 10,
    verfuegbar: true,
  },
  {
    artikel_id: 'BEILAGE_POMMES',
    kategorie: 'Beilage',
    name: 'Pommes Frites',
    beschreibung: 'Portion Pommes mit Dip',
    preis_eur: 4.2,
    vorbereitung_min: 8,
    verfuegbar: true,
  },
  {
    artikel_id: 'DRINK_COLA',
    kategorie: 'Getraenk',
    name: 'Cola 0,5l',
    beschreibung: 'Kalte Cola, 0,5 Liter',
    preis_eur: 2.9,
    vorbereitung_min: 1,
    verfuegbar: true,
  },
  {
    artikel_id: 'DRINK_WASSER',
    kategorie: 'Getraenk',
    name: 'Mineralwasser 0,5l',
    beschreibung: 'Mineralwasser, 0,5 Liter',
    preis_eur: 2.5,
    vorbereitung_min: 1,
    verfuegbar: true,
  },
  {
    artikel_id: 'DESSERT_TIRAMISU',
    kategorie: 'Dessert',
    name: 'Tiramisu',
    beschreibung: 'Hausgemachtes Tiramisu im Becher',
    preis_eur: 5.2,
    vorbereitung_min: 2,
    verfuegbar: true,
  },
];

const workflowSettings = {
  executionOrder: 'v1',
};

function dataTableId(name) {
  return {
    __rl: true,
    value: name,
    mode: 'name',
  };
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

const menuColumns = [
  { name: 'artikel_id', type: 'string' },
  { name: 'kategorie', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'beschreibung', type: 'string' },
  { name: 'preis_eur', type: 'number' },
  { name: 'vorbereitung_min', type: 'number' },
  { name: 'verfuegbar', type: 'boolean' },
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

function sticky(id, name, content, position, size = [520, 320]) {
  return {
    parameters: {
      content,
      height: size[1],
      width: size[0],
    },
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

function manualTrigger(id, position) {
  return {
    parameters: {},
    id,
    name: 'Manual Trigger',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position,
  };
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

function createTableNode(id, name, tableName, columns, position) {
  return {
    parameters: {
      resource: 'table',
      operation: 'create',
      tableName,
      columns: {
        column: columns,
      },
      options: {
        createIfNotExists: true,
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.dataTable',
    typeVersion: 1.1,
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
      additionalFields: {
        appendAttribution: false,
      },
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
      additionalFields: {
        caption,
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position,
  };
}

function buildSetupWorkflow() {
  const seedMenuCode = `const menu = ${JSON.stringify(menuItems, null, 2)};
return menu.map((item) => ({ json: item }));`;

  const nodes = [
    sticky(
      'sticky-setup',
      'Setup Hinweis',
      [
        '## Lieferdienst Demo-Datenbank',
        '',
        'Dieser Workflow legt zwei n8n Data Tables an:',
        '- lieferdienst_speisekarte',
        '- lieferdienst_bestellungen',
        '',
        'Danach wird die Demo-Speisekarte per Upsert befuellt.',
        'Bitte einmal manuell ausfuehren, bevor der Telegram-Workflow aktiv geschaltet wird.',
      ].join('\\n'),
      [180, 20],
      [520, 300],
    ),
    manualTrigger('manual-1', [220, 380]),
    createTableNode('table-menu', 'Speisekarte Tabelle anlegen', 'lieferdienst_speisekarte', menuColumns, [
      480,
      380,
    ]),
    createTableNode('table-orders', 'Bestellungen Tabelle anlegen', 'lieferdienst_bestellungen', orderColumns, [
      740,
      380,
    ]),
    codeNode('code-menu', 'Demo Speisekarte erzeugen', seedMenuCode, [1000, 380]),
    {
      parameters: {
        resource: 'row',
        operation: 'upsert',
        dataTableId: dataTableId('lieferdienst_speisekarte'),
        matchType: 'allConditions',
        filters: {
          conditions: [
            {
              keyName: 'artikel_id',
              condition: 'eq',
              keyValue: '={{ $json.artikel_id }}',
            },
          ],
        },
        columns: {
          mappingMode: 'autoMapInputData',
          value: null,
          schema: schemaFor(menuColumns),
          attemptToConvertTypes: true,
          convertFieldsToString: false,
        },
        options: {},
      },
      id: 'upsert-menu',
      name: 'Speisekarte upserten',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [1260, 380],
    },
  ];

  return {
    name: 'Lieferdienst Demo DB Setup',
    nodes,
    connections: {
      'Manual Trigger': {
        main: [[{ node: 'Speisekarte Tabelle anlegen', type: 'main', index: 0 }]],
      },
      'Speisekarte Tabelle anlegen': {
        main: [[{ node: 'Bestellungen Tabelle anlegen', type: 'main', index: 0 }]],
      },
      'Bestellungen Tabelle anlegen': {
        main: [[{ node: 'Demo Speisekarte erzeugen', type: 'main', index: 0 }]],
      },
      'Demo Speisekarte erzeugen': {
        main: [[{ node: 'Speisekarte upserten', type: 'main', index: 0 }]],
      },
    },
    pinData: {},
    active: false,
    settings: workflowSettings,
    versionId: 'lieferdienst-demo-db-setup-v1',
    meta: {
      templateCredsSetupCompleted: false,
    },
    id: 'LieferdienstDemoDbSetup',
    tags: [],
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
            operator: {
              type: 'string',
              operation: 'equals',
            },
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

const normalizeTelegramCode = `const update = $json;
const message = update.message ?? update.edited_message ?? {};
const chat = message.chat ?? {};
const from = message.from ?? {};
const voiceFileId = message.voice?.file_id ?? message.audio?.file_id ?? '';
const text = message.text ?? message.caption ?? '';

return [{
  json: {
    chat_id: String(chat.id ?? ''),
    customer_first_name: from.first_name ?? '',
    customer_last_name: from.last_name ?? '',
    username: from.username ?? '',
    message_text: String(text || '').trim(),
    voice_file_id: voiceFileId,
    has_voice: Boolean(voiceFileId),
    raw_update: update
  }
}];`;

const textOrderCode = `const item = $json;
return [{
  json: {
    ...item,
    input_type: 'text',
    order_text: item.message_text || ''
  }
}];`;

const voiceBase64Code = `const ctx = $('Telegram Eingang normalisieren').first().json;
const item = $input.first();
const bin = item.binary?.data;
if (!bin) {
  throw new Error('Voice-Datei fehlt: keine Binary-Property "data" vorhanden.');
}

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
    voice_audio: {
      data: buffer.toString('base64'),
      format
    }
  }
}];`;

const voiceOrderCode = `const ctx = $('Voice Base64 vorbereiten').first().json;
const transcript = $json.text ?? $json.transcript ?? $json.data?.text ?? '';

return [{
  json: {
    ...ctx,
    input_type: 'voice',
    transcription: String(transcript || '').trim(),
    order_text: String(transcript || '').trim()
  }
}];`;

const menuContextCode = `const ctx = $('Bestelltext sichern').first().json;
const menu = $input.all()
  .map((item) => item.json)
  .filter((item) => item && item.artikel_id);

return [{
  json: {
    ...ctx,
    menu
  }
}];`;

const loadContextCode = `const ctx = $('Speisekarte und Kontext bauen').first().json;
const rows = $input.all().map((item) => item.json).filter((row) => row && row.bestell_id);
const openOrders = rows.filter((row) => String(row.status || '').toLowerCase() === 'offen');
const sameChatRows = rows.filter((row) => String(row.chat_id || '') === String(ctx.chat_id || ''));
const pendingOrders = sameChatRows
  .filter((row) => String(row.status || '').toLowerCase() === 'unvollstaendig')
  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
const pendingOrder = pendingOrders[0] || null;
const pendingOrderText = pendingOrder
  ? [
      'Bestellnummer: ' + String(pendingOrder.bestell_id || ''),
      'Bisher erkannt: ' + String(pendingOrder.artikel_text || ''),
      'Adresse: ' + String(pendingOrder.adresse || ''),
      'Urspruengliche Nachricht: ' + String(pendingOrder.raw_text || '')
    ].join('\\n')
  : 'Keine unvollstaendige Vorbestellung fuer diesen Chat.';

const menuText = ctx.menu.map((item) => [
  item.artikel_id,
  item.name,
  item.kategorie,
  Number(item.preis_eur).toFixed(2) + ' EUR',
  'Zubereitung ca. ' + item.vorbereitung_min + ' min',
  item.verfuegbar ? 'verfuegbar' : 'nicht verfuegbar',
  item.beschreibung
].join(' | ')).join('\\n');

const systemPrompt = [
  'Du bist ein Bestellassistent fuer einen Lieferdienst.',
  'Klassifiziere zuerst die Kundennachricht.',
  'intent = "order" nur wenn der Kunde wirklich Essen/Getraenke bestellen moechte.',
  'intent = "info" wenn der Kunde nur nach Speisekarte, Nudeln/Pasta, glutenfreien Artikeln, veganen Artikeln, Groessen, Preisen, Lieferzeit, Adresse oder allgemeinen Infos fragt.',
  'Bei intent "info": keine fehlende Lieferadresse oder Bestellpositionen verlangen.',
  'Bei intent "order": extrahiere die Bestellung anhand der Speisekarte.',
  'Wenn eine unvollstaendige Vorbestellung vorhanden ist, fuehre die aktuelle Kundennachricht damit zusammen.',
  'Wenn der Kunde nur fehlende Angaben wie Lieferadresse nachreicht, behalte die Artikel aus der Vorbestellung bei.',
  'Telefonnummer und Kundenname sind optional, wenn sie nicht genannt werden.',
  'Nutze ausschliesslich Artikel aus der Speisekarte und deren artikel_id.',
  'Erfinde keine Artikel, Adressen, Telefonnummern oder Entfernungen.',
  'Wenn Angaben fehlen oder unsicher sind, schreibe sie in fehlende_infos.',
  'Antworte nur mit validem JSON ohne Markdown.',
  '',
  'JSON-Format:',
  '{',
  '  "intent": "order | info",',
  '  "info_topic": "pizza_groessen | nudeln | glutenfrei | vegan | speisekarte | preise | lieferung | oeffnungszeiten | allgemein | leer",',
  '  "antwort": "Kurze Antwort bei intent info, sonst leer",',
  '  "kunde_name": "Name oder leer",',
  '  "telefon": "Telefon oder leer",',
  '  "adresse": "Lieferadresse oder leer",',
  '  "positionen": [',
  '    {"artikel_id": "PIZZA_SALAMI", "menge": 1, "sonderwunsch": ""}',
  '  ],',
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
  'Unvollstaendige Vorbestellung fuer diesen Telegram-Chat:',
  pendingOrderText,
  '',
  'Kundennachricht:',
  ctx.order_text || '(leer)'
].join('\\n');

return [{
  json: {
    ...ctx,
    open_orders_count: openOrders.length,
    pending_order: pendingOrder,
    pending_order_text: pendingOrderText,
    system_prompt: systemPrompt,
    user_message: userMessage
  }
}];`;

const parseOrderCode = `const ctx = $('Auslastung vorbereiten').first().json;
const rawContent = $json?.choices?.[0]?.message?.content ?? '';

let parsed;
try {
  const clean = String(rawContent).replace(/^\`\`\`json/i, '').replace(/^\`\`\`/i, '').replace(/\`\`\`$/i, '').trim();
  parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
} catch (error) {
  parsed = {
    intent: 'info',
    info_topic: 'allgemein',
    antwort: 'Ich habe deine Nachricht nicht sicher verstanden. Du kannst nach der Speisekarte fragen oder direkt deine Bestellung mit Lieferadresse senden.',
    kunde_name: '',
    telefon: '',
    adresse: '',
    positionen: [],
    fehlende_infos: [],
    notizen: 'LLM JSON parsing failed: ' + String(error.message || error)
  };
}

const address = String(parsed.adresse ?? '').trim();
const geocodeQuery = address
  ? address + ', Karlsruhe, Deutschland'
  : 'Blenkerstr. 39, 76187 Karlsruhe, Deutschland';

return [{
  json: {
    ...ctx,
    parsed_order: parsed,
    raw_order_json: rawContent.slice(0, 1000),
    restaurant_address: 'Blenkerstr. 39, 76187 Karlsruhe',
    restaurant_lat: 49.0404374,
    restaurant_lon: 8.3464520,
    geocode_query: geocodeQuery,
    geocode_query_encoded: encodeURIComponent(geocodeQuery)
  }
}];`;

const prepareRouteCode = `const ctx = $('Bestell-JSON parsen').first().json;
const rows = $input.all().map((item) => item.json).filter((row) => row && Object.keys(row).length > 0);
const first = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
const lat = Number(first?.lat);
const lon = Number(first?.lon);
const geocodeOk = Boolean(ctx.parsed_order?.adresse) && Number.isFinite(lat) && Number.isFinite(lon);
const targetLat = geocodeOk ? lat : ctx.restaurant_lat;
const targetLon = geocodeOk ? lon : ctx.restaurant_lon;

return [{
  json: {
    ...ctx,
    geocode_ok: geocodeOk,
    delivery_lat: geocodeOk ? lat : null,
    delivery_lon: geocodeOk ? lon : null,
    geocode_display_name: first?.display_name || '',
    route_url: 'https://router.project-osrm.org/route/v1/driving/' +
      ctx.restaurant_lon + ',' + ctx.restaurant_lat + ';' + targetLon + ',' + targetLat +
      '?overview=false&alternatives=false&steps=false'
  }
}];`;

const calculateOrderCode = `const ctx = $('Route URL vorbereiten').first().json;
const menu = ctx.menu || [];
const menuById = new Map(menu.map((item) => [String(item.artikel_id), item]));
const parsed = ctx.parsed_order || {};
const route = Array.isArray($json.routes) ? $json.routes[0] : null;

function text(value) {
  return String(value ?? '').trim();
}

function menuLinesFor(category) {
  return menu
    .filter((item) => !category || String(item.kategorie).toLowerCase() === category)
    .map((item) => '- ' + item.name + ' (' + Number(item.preis_eur).toFixed(2) + ' EUR)')
    .join('\\n');
}

function menuLinesWhere(predicate) {
  return menu
    .filter(predicate)
    .map((item) => '- ' + item.name + ' (' + Number(item.preis_eur).toFixed(2) + ' EUR) - ' + text(item.beschreibung))
    .join('\\n');
}

function infoReply() {
  const topic = text(parsed.info_topic).toLowerCase();
  const answer = text(parsed.antwort);
  if (topic.includes('groess') || /groess|größe|gross|size/i.test(ctx.order_text || '')) {
    return [
      'Ich schicke dir die Speisekarte als PDF mit. Dort findest du die verfuegbaren Pizzen, Preise und Groessen.',
      '',
      'Wenn du bestellen moechtest, schick mir einfach Artikel und Lieferadresse.'
    ].join('\\n');
  }
  if (topic.includes('nudel') || topic.includes('pasta') || /nudel|pasta|spaghetti|penne/i.test(ctx.order_text || '')) {
    return [
      'Unsere Nudelgerichte:',
      menuLinesWhere((item) => String(item.kategorie).toLowerCase() === 'pasta'),
      '',
      'Wenn du moechtest, kann ich dir davon auch nur glutenfreie oder vegane Optionen nennen.'
    ].join('\\n');
  }
  if (topic.includes('gluten') || /glutenfrei|gluten/i.test(ctx.order_text || '')) {
    const lines = menuLinesWhere((item) => /glutenfrei/i.test(text(item.beschreibung)));
    return [
      lines ? 'Diese Artikel sind laut Demo-Speisekarte glutenfrei:' : 'Ich finde aktuell keine glutenfreien Artikel in der Demo-Speisekarte.',
      lines,
      '',
      'Hinweis: Das ist Demo-Datenmaterial. Fuer echte Allergene sollte der Betrieb die Angaben verbindlich pflegen.'
    ].filter(Boolean).join('\\n');
  }
  if (topic.includes('vegan') || /vegan/i.test(ctx.order_text || '')) {
    const lines = menuLinesWhere((item) => /vegan/i.test(text(item.beschreibung)));
    return [
      lines ? 'Diese Artikel sind laut Demo-Speisekarte vegan:' : 'Ich finde aktuell keine veganen Artikel in der Demo-Speisekarte.',
      lines,
      '',
      'Wenn du bestellen moechtest, schick mir Artikel und Lieferadresse.'
    ].filter(Boolean).join('\\n');
  }
  if (topic.includes('speisekarte') || /speisekarte|karte|angebot|habt ihr/i.test(ctx.order_text || '')) {
    return [
      'Ich schicke dir die aktuelle Speisekarte als PDF mit.',
      '',
      'Darin findest du Sortiment, Preise, Pizza-Groessen und Varianten. Zum Bestellen bitte Artikel, Menge und Lieferadresse senden.'
    ].join('\\n');
  }
  if (topic.includes('liefer')) {
    return [
      'Wir liefern ab Blenkerstr. 39, 76187 Karlsruhe.',
      'Die Entfernung und Wartezeit berechne ich automatisch, sobald du deine Lieferadresse sendest.'
    ].join('\\n');
  }
  return answer || 'Ich kann dir bei Speisekarte, Preisen, Lieferung und Bestellungen helfen. Was moechtest du wissen?';
}

function looksLikeInfoQuestion() {
  const raw = text(ctx.order_text).toLowerCase();
  const hasInfoSignal = /\\?|speisekarte|karte|sortiment|angebot|groess|größe|gross|gluten|vegan|vegetarisch|preise|was fuer|was für|welche|habt ihr|gibt es/.test(raw);
  const hasOrderSignal = /\\b(bestelle|bestellen|bestellung|nehme|nehmen|nimm|haette gern|hätte gern|haette gerne|hätte gerne|ich will|ich moechte|ich möchte|ich kriege|ich bekomme|einmal|zweimal|1x|2x|3x)\\b/.test(raw);
  return hasInfoSignal && !hasOrderSignal;
}

function shouldSendMenuPdf() {
  const topic = text(parsed.info_topic).toLowerCase();
  const raw = text(ctx.order_text).toLowerCase();
  return (
    topic.includes('speisekarte') ||
    topic.includes('preise') ||
    topic.includes('groess') ||
    /speisekarte|karte|sortiment|angebot|preise|groess|größe|gross/i.test(raw)
  );
}

const parsedPositions = Array.isArray(parsed.positionen) ? parsed.positionen : [];
const hasParsedPositions = parsedPositions.some((position) => text(position.artikel_id));
const parsedIntent = text(parsed.intent).toLowerCase();
const intent = hasParsedPositions || parsedIntent === 'order'
  ? 'order'
  : (parsedIntent === 'info' || looksLikeInfoQuestion() ? 'info' : 'order');
if (intent === 'info') {
  return [{
    json: {
      bestell_id: '',
      chat_id: ctx.chat_id,
      kunde_name: [ctx.customer_first_name, ctx.customer_last_name].filter(Boolean).join(' ').trim() || 'Telegram Kunde',
      telefon: '',
      adresse: '',
      positionen: [],
      artikel_text: '',
      gesamtpreis_eur: 0,
      entfernung_km: 0,
      entfernung_geschaetzt: false,
      route_minuten: 0,
      restaurant_address: ctx.restaurant_address,
      geocode_display_name: '',
      offene_bestellungen: Number(ctx.open_orders_count || 0),
      wartezeit_min: 0,
      wartezeit_text: '',
      status: 'info',
      complete: false,
      is_info: true,
      missing: [],
      raw_text: ctx.order_text,
      input_type: ctx.input_type,
      telegram_reply: infoReply(),
      should_send_menu_pdf: shouldSendMenuPdf(),
      llm_raw: ctx.raw_order_json,
      created_at: new Date().toISOString()
    }
  }];
}

const positions = parsedPositions;
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

for (const position of positions) {
  const id = text(position.artikel_id).toUpperCase();
  const menuItem = menuById.get(id);
  const qty = Math.max(1, Math.round(Number(position.menge || 1)));
  if (!menuItem) {
    missing.push('Artikel nicht in der Speisekarte erkannt: ' + (id || 'unbekannt'));
    continue;
  }
  if (menuItem.verfuegbar === false || String(menuItem.verfuegbar).toLowerCase() === 'false') {
    missing.push('Artikel ist aktuell nicht verfuegbar: ' + menuItem.name);
    continue;
  }
  const lineTotal = Number(menuItem.preis_eur) * qty;
  total += lineTotal;
  itemCount += qty;
  maxPrep = Math.max(maxPrep, Number(menuItem.vorbereitung_min) || 12);
  resolved.push({
    artikel_id: id,
    name: menuItem.name,
    menge: qty,
    einzelpreis_eur: Number(menuItem.preis_eur),
    gesamtpreis_eur: Number(lineTotal.toFixed(2)),
    sonderwunsch: text(position.sonderwunsch)
  });
}

const address = text(parsed.adresse);
if (!address) missing.push('Lieferadresse');
if (resolved.length === 0) missing.push('Bestellpositionen');
if (address && !ctx.geocode_ok) missing.push('Lieferadresse konnte nicht gefunden werden');

const routeDistanceKm = route?.distance ? Number(route.distance) / 1000 : null;
const routeDurationMin = route?.duration ? Math.ceil(Number(route.duration) / 60) : null;
if (address && ctx.geocode_ok && (!routeDistanceKm || !routeDurationMin)) missing.push('Route konnte nicht berechnet werden');
const distanceKm = routeDistanceKm ?? 0;
const openOrders = Number(ctx.open_orders_count || 0);
const loadSurcharge = openOrders * 3;
const extraItemSurcharge = Math.max(0, itemCount - 3) * 2;
const driveMinutes = routeDurationMin ? routeDurationMin + 5 : 0;
const waitRaw = maxPrep + loadSurcharge + extraItemSurcharge + driveMinutes;
const waitMinutes = Math.max(20, Math.round(waitRaw / 5) * 5);
const waitRange = waitMinutes + '-' + (waitMinutes + 10);
const complete = missing.length === 0;
const bestellId = 'LD-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const customerName = text(parsed.kunde_name) || [ctx.customer_first_name, ctx.customer_last_name].filter(Boolean).join(' ').trim() || 'Telegram Kunde';
const itemLines = resolved.map((item) => item.menge + 'x ' + item.name + (item.sonderwunsch ? ' (' + item.sonderwunsch + ')' : ''));

const reply = complete
  ? [
      'Danke, deine Bestellung ist eingegangen.',
      '',
      'Bestellnummer: ' + bestellId,
      itemLines.join('\\n'),
      '',
      'Gesamtpreis: ' + total.toFixed(2) + ' EUR',
      'Entfernung: ca. ' + distanceKm.toFixed(1) + ' km',
      'Route: ' + (ctx.geocode_display_name || address),
      'Aktuelle Auslastung: ' + openOrders + ' offene Bestellung(en)',
      'Voraussichtliche Wartezeit: ca. ' + waitRange + ' Minuten',
      '',
      'Hinweis: Dies ist eine Demo-Bestaetigung. In Produktion wuerde hier noch eine verbindliche Freigabe erfolgen.'
    ].join('\\n')
  : [
      'Danke, ich habe deine Bestellung teilweise erkannt.',
      '',
      resolved.length ? 'Erkannt:\\n' + itemLines.join('\\n') : 'Erkannte Artikel: keine sicheren Treffer',
      '',
      'Mir fehlt noch:',
      ...Array.from(new Set(missing)).map((entry) => '- ' + entry),
      '',
      'Bitte sende die fehlenden Angaben als Text oder Sprachnachricht.'
    ].join('\\n');

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
    entfernung_km: Number(distanceKm.toFixed(1)),
    entfernung_geschaetzt: false,
    route_minuten: routeDurationMin ?? 0,
    restaurant_address: ctx.restaurant_address,
    geocode_display_name: ctx.geocode_display_name,
    offene_bestellungen: openOrders,
    wartezeit_min: waitMinutes,
    wartezeit_text: waitRange + ' Minuten',
    status: complete ? 'offen' : 'unvollstaendig',
    complete,
    missing: Array.from(new Set(missing)),
    raw_text: ctx.order_text,
    input_type: ctx.input_type,
    telegram_reply: reply,
    should_send_menu_pdf: false,
    llm_raw: ctx.raw_order_json,
    created_at: new Date().toISOString()
  }
}];`;

const slackOrderCode = `const order = $('Bestellung berechnen').first().json;

function text(value) {
  return String(value ?? '').trim();
}

const positions = Array.isArray(order.positionen) ? order.positionen : [];
const itemLines = positions.length
  ? positions.map((item) => {
      const wish = text(item.sonderwunsch) ? ' (' + text(item.sonderwunsch) + ')' : '';
      return '- ' + item.menge + 'x ' + item.name + wish + ' - ' + Number(item.gesamtpreis_eur || 0).toFixed(2) + ' EUR';
    }).join('\\n')
  : '- Keine sicheren Positionen';

const mapQuery = encodeURIComponent(text(order.adresse || order.geocode_display_name));
const mapLine = mapQuery ? 'Google Maps: https://www.google.com/maps/search/?api=1&query=' + mapQuery : '';

const slackLines = [
  '*Neue Lieferdienst-Bestellung*',
  '',
  '*Bestellnummer:* ' + text(order.bestell_id),
  '*Zeitpunkt:* ' + text(order.created_at),
  '*Kunde:* ' + text(order.kunde_name),
  text(order.telefon) ? '*Telefon:* ' + text(order.telefon) : '',
  '',
  '*Bestellung:*',
  itemLines,
  '',
  '*Gesamtpreis:* ' + Number(order.gesamtpreis_eur || 0).toFixed(2) + ' EUR',
  '*Adresse:* ' + text(order.adresse),
  text(order.geocode_display_name) ? '*Gefunden als:* ' + text(order.geocode_display_name) : '',
  mapLine,
  '',
  '*Lieferung:*',
  '- Entfernung: ca. ' + Number(order.entfernung_km || 0).toFixed(1) + ' km',
  '- Fahrzeit Route: ca. ' + Number(order.route_minuten || 0) + ' min',
  '- Wartezeit: ca. ' + text(order.wartezeit_text),
  '- Offene Bestellungen vorher: ' + Number(order.offene_bestellungen || 0),
  '',
  '*Originalnachricht:*',
  text(order.raw_text) || 'Nicht vorhanden'
].filter(Boolean);

return [{
  json: {
    ...order,
    slack_text: slackLines.join('\\n')
  }
}];`;

function buildTelegramWorkflow() {
  const nodes = [
    sticky(
      'sticky-main',
      'Workflow Hinweis',
      [
        '## Telegram Lieferdienst Demo',
        '',
        'Vorher einmal den Setup-Workflow ausfuehren.',
        '',
        'Credentials/Env:',
        '- Telegram Bot Credential in n8n setzen',
        '- OPENROUTER_API_KEY fuer Voice-Transkription und Bestell-JSON',
        '- SLACK_STEINOFENBOT_WEBHOOK_URL bevorzugt fuer den Slack-Channel #steinofenbot',
        '- SLACK_ORDERS_WEBHOOK_URL optional fuer interne Bestellmeldungen',
        '',
        'Die Speisekarte wird aus der n8n Data Table lieferdienst_speisekarte gelesen.',
        'Bestellungen werden in lieferdienst_bestellungen gespeichert.',
      ].join('\\n'),
      [100, -120],
      [560, 360],
    ),
    {
      parameters: {
        updates: ['message'],
        additionalFields: {},
      },
      id: 'telegram-trigger',
      name: 'Telegram Trigger',
      type: 'n8n-nodes-base.telegramTrigger',
      typeVersion: 1.3,
      position: [120, 360],
    },
    codeNode('normalize-telegram', 'Telegram Eingang normalisieren', normalizeTelegramCode, [380, 360]),
    ifNode('if-voice', 'Hat Sprachnachricht?', '={{ String($json.has_voice) }}', 'true', [640, 360]),
    {
      parameters: {
        resource: 'file',
        operation: 'get',
        fileId: '={{ $json.voice_file_id }}',
        download: true,
        additionalFields: {
          mimeType: 'audio/ogg',
        },
      },
      id: 'telegram-file',
      name: 'Voice Datei laden',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [900, 240],
    },
    codeNode('voice-base64', 'Voice Base64 vorbereiten', voiceBase64Code, [1160, 240]),
    {
      parameters: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/audio/transcriptions',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{$env.OPENROUTER_API_KEY}}',
            },
            {
              name: 'Content-Type',
              value: 'application/json',
            },
            {
              name: 'HTTP-Referer',
              value: 'https://your-domain.de',
            },
            {
              name: 'X-Title',
              value: 'Telegram Lieferdienst Demo',
            },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "model": "openai/whisper-1", "input_audio": $json.voice_audio } }}',
        options: {
          timeout: 60000,
        },
      },
      id: 'openrouter-transcription',
      name: 'OpenRouter Transkription',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1420, 240],
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 2000,
      onError: 'continueErrorOutput',
    },
    codeNode('voice-text', 'Transkript als Bestelltext', voiceOrderCode, [1680, 240]),
    telegramMessageNode(
      'voice-error-reply',
      'Sprachfehler Antwort',
      "={{ $('Telegram Eingang normalisieren').first().json.chat_id }}",
      'Entschuldigung, ich konnte deine Sprachnachricht gerade nicht verarbeiten. Bitte sende deine Bestellung als kurze Textnachricht (Artikel, Menge und Lieferadresse).',
      [1680, 80],
    ),
    codeNode('text-order', 'Text als Bestelltext', textOrderCode, [900, 500]),
    {
      parameters: {
        mode: 'append',
        numberInputs: 2,
      },
      id: 'merge-order-text',
      name: 'Bestelltext zusammenfuehren',
      type: 'n8n-nodes-base.merge',
      typeVersion: 3.2,
      position: [1660, 360],
    },
    codeNode(
      'save-order-context',
      'Bestelltext sichern',
      `const item = $input.first().json;
return [{ json: item }];`,
      [1920, 360],
    ),
    getRowsNode('menu-get', 'Speisekarte laden', 'lieferdienst_speisekarte', [2180, 360]),
    codeNode('menu-context', 'Speisekarte und Kontext bauen', menuContextCode, [2440, 360]),
    getRowsNode('orders-get', 'Offene Bestellungen laden', 'lieferdienst_bestellungen', [2700, 360], true),
    codeNode('load-context', 'Auslastung vorbereiten', loadContextCode, [2960, 360]),
    {
      parameters: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'Authorization',
              value: '=Bearer {{$env.OPENROUTER_API_KEY}}',
            },
            {
              name: 'Content-Type',
              value: 'application/json',
            },
            {
              name: 'HTTP-Referer',
              value: 'https://your-domain.de',
            },
            {
              name: 'X-Title',
              value: 'Telegram Lieferdienst Demo',
            },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody:
          '={{ { "model": "meta-llama/llama-3.3-70b-instruct", "temperature": 0.1, "response_format": { "type": "json_object" }, "messages": [{ "role": "system", "content": $json.system_prompt }, { "role": "user", "content": $json.user_message }] } }}',
        options: {
          timeout: 30000,
        },
      },
      id: 'openrouter-order',
      name: 'OpenRouter Bestellung extrahieren',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3220, 360],
    },
    codeNode('parse-order-json', 'Bestell-JSON parsen', parseOrderCode, [3480, 360]),
    {
      parameters: {
        method: 'GET',
        url: "={{ 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=' + $json.geocode_query_encoded }}",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: 'User-Agent',
              value: 'n8n-lieferdienst-demo/1.0 (your-domain.de)',
            },
            {
              name: 'Accept-Language',
              value: 'de',
            },
          ],
        },
        options: {
          timeout: 15000,
        },
      },
      id: 'geocode-address',
      name: 'Lieferadresse geocodieren',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [3740, 360],
      alwaysOutputData: true,
    },
    codeNode('prepare-route-url', 'Route URL vorbereiten', prepareRouteCode, [4000, 360]),
    {
      parameters: {
        method: 'GET',
        url: '={{ $json.route_url }}',
        options: {
          timeout: 15000,
        },
      },
      id: 'calculate-route',
      name: 'Route berechnen',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [4260, 360],
    },
    codeNode('calculate-order', 'Bestellung berechnen', calculateOrderCode, [4520, 360]),
    ifNode('if-complete', 'Bestellung vollstaendig?', '={{ String($json.complete) }}', 'true', [4780, 360]),
    {
      parameters: {
        resource: 'row',
        operation: 'insert',
        dataTableId: dataTableId('lieferdienst_bestellungen'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            bestell_id: "={{ $('Bestellung berechnen').first().json.bestell_id }}",
            chat_id: "={{ $('Bestellung berechnen').first().json.chat_id }}",
            kunde_name: "={{ $('Bestellung berechnen').first().json.kunde_name }}",
            adresse: "={{ $('Bestellung berechnen').first().json.adresse }}",
            artikel_text: "={{ $('Bestellung berechnen').first().json.artikel_text }}",
            gesamtpreis_eur: "={{ $('Bestellung berechnen').first().json.gesamtpreis_eur }}",
            entfernung_km: "={{ $('Bestellung berechnen').first().json.entfernung_km }}",
            wartezeit_min: "={{ $('Bestellung berechnen').first().json.wartezeit_min }}",
            status: "={{ $('Bestellung berechnen').first().json.status }}",
            created_at: "={{ $('Bestellung berechnen').first().json.created_at }}",
            raw_text: "={{ $('Bestellung berechnen').first().json.raw_text }}",
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
      position: [5040, 260],
    },
    codeNode('slack-order-message', 'Slack Bestellnachricht bauen', slackOrderCode, [5300, 180]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.SLACK_STEINOFENBOT_WEBHOOK_URL || $env.SLACK_ORDERS_WEBHOOK_URL || $env.SLACK_WEBHOOK_URL }}',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "text": $json.slack_text, "channel": $env.SLACK_ORDERS_CHANNEL || "#steinofenbot" } }}',
        options: {},
      },
      id: 'slack-order-send',
      name: 'Slack Bestellung senden',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [5560, 180],
      continueOnFail: true,
    },
    telegramMessageNode(
      'telegram-reply',
      'Telegram Antwort senden',
      "={{ $('Bestellung berechnen').first().json.chat_id }}",
      "={{ $('Bestellung berechnen').first().json.telegram_reply }}",
      [5560, 420],
    ),
    ifNode(
      'if-save-draft',
      'Unvollstaendige Bestellung speichern?',
      "={{ String($json.status === 'unvollstaendig' && Boolean($json.artikel_text || $json.adresse)) }}",
      'true',
      [5040, 500],
    ),
    {
      parameters: {
        resource: 'row',
        operation: 'insert',
        dataTableId: dataTableId('lieferdienst_bestellungen'),
        columns: {
          mappingMode: 'defineBelow',
          value: {
            bestell_id: "={{ $('Bestellung berechnen').first().json.bestell_id }}",
            chat_id: "={{ $('Bestellung berechnen').first().json.chat_id }}",
            kunde_name: "={{ $('Bestellung berechnen').first().json.kunde_name }}",
            adresse: "={{ $('Bestellung berechnen').first().json.adresse }}",
            artikel_text: "={{ $('Bestellung berechnen').first().json.artikel_text }}",
            gesamtpreis_eur: "={{ $('Bestellung berechnen').first().json.gesamtpreis_eur }}",
            entfernung_km: "={{ $('Bestellung berechnen').first().json.entfernung_km }}",
            wartezeit_min: "={{ $('Bestellung berechnen').first().json.wartezeit_min }}",
            status: "={{ $('Bestellung berechnen').first().json.status }}",
            created_at: "={{ $('Bestellung berechnen').first().json.created_at }}",
            raw_text: "={{ $('Bestellung berechnen').first().json.raw_text }}",
          },
          schema: schemaFor(orderColumns),
          attemptToConvertTypes: true,
          convertFieldsToString: false,
        },
        options: {},
      },
      id: 'insert-order-draft',
      name: 'Bestellentwurf speichern',
      type: 'n8n-nodes-base.dataTable',
      typeVersion: 1.1,
      position: [5300, 560],
    },
    ifNode(
      'if-menu-pdf',
      'Speisekarte PDF senden?',
      "={{ String($('Bestellung berechnen').first().json.should_send_menu_pdf) }}",
      'true',
      [5820, 420],
    ),
    telegramDocumentNode(
      'telegram-menu-pdf',
      'Telegram Speisekarte PDF senden',
      "={{ $('Bestellung berechnen').first().json.chat_id }}",
      "={{ $env.MENU_PDF_URL || 'https://weur-cdn.speisekarte.menu/storage/media/companies_menu_pdf/114411922/steinofen-pizzeria-karlsruhe-speisekarte.pdf' }}",
      'Hier ist die Speisekarte als PDF. Bitte beachte: Preise und Verfuegbarkeit koennen sich aendern.',
      [6080, 320],
    ),
  ];

  return {
    name: 'Telegram Lieferdienst Bestellung Demo',
    nodes,
    connections: {
      'Telegram Trigger': {
        main: [[{ node: 'Telegram Eingang normalisieren', type: 'main', index: 0 }]],
      },
      'Telegram Eingang normalisieren': {
        main: [[{ node: 'Hat Sprachnachricht?', type: 'main', index: 0 }]],
      },
      'Hat Sprachnachricht?': {
        main: [
          [{ node: 'Voice Datei laden', type: 'main', index: 0 }],
          [{ node: 'Text als Bestelltext', type: 'main', index: 0 }],
        ],
      },
      'Voice Datei laden': {
        main: [[{ node: 'Voice Base64 vorbereiten', type: 'main', index: 0 }]],
      },
      'Voice Base64 vorbereiten': {
        main: [[{ node: 'OpenRouter Transkription', type: 'main', index: 0 }]],
      },
      'OpenRouter Transkription': {
        main: [
          [{ node: 'Transkript als Bestelltext', type: 'main', index: 0 }],
          [{ node: 'Sprachfehler Antwort', type: 'main', index: 0 }],
        ],
      },
      'Transkript als Bestelltext': {
        main: [[{ node: 'Bestelltext zusammenfuehren', type: 'main', index: 0 }]],
      },
      'Text als Bestelltext': {
        main: [[{ node: 'Bestelltext zusammenfuehren', type: 'main', index: 1 }]],
      },
      'Bestelltext zusammenfuehren': {
        main: [[{ node: 'Bestelltext sichern', type: 'main', index: 0 }]],
      },
      'Bestelltext sichern': {
        main: [[{ node: 'Speisekarte laden', type: 'main', index: 0 }]],
      },
      'Speisekarte laden': {
        main: [[{ node: 'Speisekarte und Kontext bauen', type: 'main', index: 0 }]],
      },
      'Speisekarte und Kontext bauen': {
        main: [[{ node: 'Offene Bestellungen laden', type: 'main', index: 0 }]],
      },
      'Offene Bestellungen laden': {
        main: [[{ node: 'Auslastung vorbereiten', type: 'main', index: 0 }]],
      },
      'Auslastung vorbereiten': {
        main: [[{ node: 'OpenRouter Bestellung extrahieren', type: 'main', index: 0 }]],
      },
      'OpenRouter Bestellung extrahieren': {
        main: [[{ node: 'Bestell-JSON parsen', type: 'main', index: 0 }]],
      },
      'Bestell-JSON parsen': {
        main: [[{ node: 'Lieferadresse geocodieren', type: 'main', index: 0 }]],
      },
      'Lieferadresse geocodieren': {
        main: [[{ node: 'Route URL vorbereiten', type: 'main', index: 0 }]],
      },
      'Route URL vorbereiten': {
        main: [[{ node: 'Route berechnen', type: 'main', index: 0 }]],
      },
      'Route berechnen': {
        main: [[{ node: 'Bestellung berechnen', type: 'main', index: 0 }]],
      },
      'Bestellung berechnen': {
        main: [[{ node: 'Bestellung vollstaendig?', type: 'main', index: 0 }]],
      },
      'Bestellung vollstaendig?': {
        main: [
          [{ node: 'Bestellung speichern', type: 'main', index: 0 }],
          [{ node: 'Unvollstaendige Bestellung speichern?', type: 'main', index: 0 }],
        ],
      },
      'Unvollstaendige Bestellung speichern?': {
        main: [
          [{ node: 'Bestellentwurf speichern', type: 'main', index: 0 }],
          [{ node: 'Telegram Antwort senden', type: 'main', index: 0 }],
        ],
      },
      'Bestellentwurf speichern': {
        main: [[{ node: 'Telegram Antwort senden', type: 'main', index: 0 }]],
      },
      'Bestellung speichern': {
        main: [
          [
            { node: 'Slack Bestellnachricht bauen', type: 'main', index: 0 },
            { node: 'Telegram Antwort senden', type: 'main', index: 0 },
          ],
        ],
      },
      'Slack Bestellnachricht bauen': {
        main: [[{ node: 'Slack Bestellung senden', type: 'main', index: 0 }]],
      },
      'Telegram Antwort senden': {
        main: [[{ node: 'Speisekarte PDF senden?', type: 'main', index: 0 }]],
      },
      'Speisekarte PDF senden?': {
        main: [
          [{ node: 'Telegram Speisekarte PDF senden', type: 'main', index: 0 }],
          [],
        ],
      },
    },
    pinData: {},
    active: false,
    settings: workflowSettings,
    versionId: 'telegram-lieferdienst-bestellung-demo-v1',
    meta: {
      templateCredsSetupCompleted: false,
    },
    id: 'TelegramLieferdienstBestellungDemo',
    tags: [],
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const root = path.resolve(__dirname, '..');
  writeJson(path.join(root, 'data', 'lieferdienst-speisekarte.json'), {
    name: 'Bella Express Demo Speisekarte',
    note: 'Fiktive Demo-Speisekarte fuer den n8n Lieferdienst-Workflow.',
    items: menuItems,
  });
  writeJson(path.join(root, 'n8n-lieferdienst-demo-db-setup.json'), buildSetupWorkflow());
  writeJson(path.join(root, 'n8n-telegram-lieferdienst-workflow.json'), buildTelegramWorkflow());
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSetupWorkflow,
  buildTelegramWorkflow,
  menuItems,
};
