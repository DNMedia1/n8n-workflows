#!/usr/bin/env node
/*
 * Saubere Neubefuellung der Data Table "lieferdienst_speisekarte".
 *
 * Da die n8n Public API Zeilen NICHT loeschen kann (DELETE/PATCH = 405),
 * wird die Tabelle auf Tabellen-Ebene geloescht und identisch neu angelegt
 * (POST/DELETE auf /data-tables sind erlaubt), danach werden die 44 Artikel
 * eingefuegt. Der Workflow referenziert die Tabelle per NAME -> verlinkt
 * sich automatisch neu.
 *
 * Eingabe : data/lieferdienst-speisekarte.json (Quelle der Wahrheit)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const KEY = fs.readFileSync(path.join(root, 'secrets', 'n8n-api-key'), 'utf8').trim();
const BASE = 'https://srv1651618.hstgr.cloud/api/v1';
const TABLE = 'lieferdienst_speisekarte';

const items = JSON.parse(fs.readFileSync(path.join(root, 'data', 'lieferdienst-speisekarte.json'), 'utf8')).items;

const columns = [
  { name: 'artikel_id', type: 'string' },
  { name: 'kategorie', type: 'string' },
  { name: 'name', type: 'string' },
  { name: 'beschreibung', type: 'string' },
  { name: 'preis_eur', type: 'number' },
  { name: 'vorbereitung_min', type: 'number' },
  { name: 'verfuegbar', type: 'boolean' },
];

function api(method, urlPath, body) {
  const args = ['-s', '--max-time', '60', '-X', method, '-H', `X-N8N-API-KEY: ${KEY}`, '-w', '\n__CODE__%{http_code}'];
  if (body !== undefined) { args.push('-H', 'Content-Type: application/json', '--data-binary', '@-'); }
  args.push(`${BASE}${urlPath}`);
  const r = spawnSync('curl', args, { input: body !== undefined ? JSON.stringify(body) : undefined, encoding: 'utf8', maxBuffer: 1e8 });
  const out = r.stdout || '';
  const i = out.lastIndexOf('\n__CODE__');
  const code = i >= 0 ? parseInt(out.slice(i + 9), 10) : 0;
  const raw = i >= 0 ? out.slice(0, i) : out;
  let json; try { json = JSON.parse(raw); } catch (e) { json = { _raw: raw.slice(0, 300) }; }
  return { code, json };
}

(function main() {
  // 1) Aktuelle Tabelle per Name finden
  const list = api('GET', '/data-tables?limit=100');
  const tables = (list.json && (list.json.data || list.json)) || [];
  const existing = tables.find((t) => t.name === TABLE);
  console.log('Gefundene Tabelle:', existing ? existing.id : '(keine)');

  // 2) Loeschen
  if (existing) {
    const del = api('DELETE', `/data-tables/${existing.id}`);
    console.log('DELETE Tabelle: HTTP', del.code);
    if (del.code < 200 || del.code >= 300) { console.log('ABBRUCH: Loeschen fehlgeschlagen:', JSON.stringify(del.json).slice(0, 160)); return; }
  }

  // 3) Neu anlegen (gleicher Name + Schema)
  const create = api('POST', '/data-tables', { name: TABLE, columns });
  console.log('CREATE Tabelle: HTTP', create.code);
  if (create.code < 200 || create.code >= 300) { console.log('ABBRUCH: Anlegen fehlgeschlagen:', JSON.stringify(create.json).slice(0, 200)); return; }
  const newId = create.json.id;
  console.log('Neue Tabellen-ID:', newId);

  // 4) 44 Artikel einfuegen
  const ins = api('POST', `/data-tables/${newId}/rows`, { data: items });
  console.log('INSERT rows: HTTP', ins.code, '->', JSON.stringify(ins.json).slice(0, 120));

  // 5) Verifizieren
  const rowsRes = api('GET', `/data-tables/${newId}/rows?limit=200`);
  const rows = (rowsRes.json && (rowsRes.json.data || rowsRes.json)) || [];
  console.log('\nZeilen final:', rows.length, '/ erwartet', items.length);
  const cats = {};
  rows.forEach((r) => { cats[r.kategorie] = (cats[r.kategorie] || 0) + 1; });
  console.log('Kategorien:', JSON.stringify(cats));
  const turkish = rows.filter((r) => /Doener|Iskender|Sucuk|Coban|Ayran|Pide/.test(r.name)).map((r) => r.name);
  console.log('Tuerkische Namen:', turkish.join(', '));
  console.log('Stichprobe:', rows.slice(0, 4).map((r) => `${r.name} ${r.preis_eur}EUR`).join(' | '));
})();
