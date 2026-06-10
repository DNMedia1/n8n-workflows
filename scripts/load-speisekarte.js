#!/usr/bin/env node
/*
 * Laedt die echte (kuratierte) Steinofen-Pizzeria-Speisekarte in die n8n
 * Data Table "lieferdienst_speisekarte".
 *
 * Regeln: Beschreibungen auf Deutsch; tuerkische Gerichtnamen bleiben
 * (Pide, Doener, Iskender, Sucuk, Coban, Ayran). Preise aus dem PDF wo
 * angegeben, sonst realistische Demo-Schaetzwerte.
 *
 * Ablauf (idempotent): Data-File schreiben -> alle alten Zeilen loeschen
 * -> neue Zeilen einfuegen -> verifizieren. API ueber curl (Sandbox-Egress).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const KEY = fs.readFileSync(path.join(root, 'secrets', 'n8n-api-key'), 'utf8').trim();
const BASE = 'https://srv1651618.hstgr.cloud/api/v1';
const TID = 'dH7G8qXyC98heck4'; // lieferdienst_speisekarte

const menu = [
  // --- Pizza (Ø 30 cm) ---
  ['PIZZA_MARGHERITA','Pizza','Pizza Margherita','Tomatensauce, Mozzarella, Basilikum',7.5,16],
  ['PIZZA_SALAMI','Pizza','Pizza Salami','Tomatensauce, Mozzarella, Salami',8.5,16],
  ['PIZZA_PROSCIUTTO','Pizza','Pizza Prosciutto','Tomatensauce, Mozzarella, Schinken',8.5,16],
  ['PIZZA_FUNGHI','Pizza','Pizza Funghi','Tomatensauce, Mozzarella, Champignons',8.5,16],
  ['PIZZA_HAWAII','Pizza','Pizza Hawaii','Tomatensauce, Mozzarella, Schinken, Ananas',9.0,16],
  ['PIZZA_CAPRICCIOSA','Pizza','Pizza Capricciosa','Tomatensauce, Mozzarella, Schinken, Champignons, Artischocken',9.5,17],
  ['PIZZA_FRUTTI_DI_MARE','Pizza','Pizza Frutti di Mare','Tomatensauce, Mozzarella, Meeresfruechte, Knoblauch',10.5,18],
  ['PIZZA_QUATTRO_FORMAGGI','Pizza','Pizza Quattro Formaggi','Tomatensauce, vier Kaesesorten (Edamer, Schafskaese, Mozzarella, Gorgonzola)',9.9,17],
  ['PIZZA_VEGETARIA','Pizza','Pizza Vegetaria','Tomatensauce, Mozzarella, frisches Gemuese, vegetarisch',9.0,17],
  ['PIZZA_SUCUK','Pizza','Pizza Sucuk','Tomatensauce, Mozzarella, tuerkische Knoblauchwurst (Sucuk)',9.5,17],
  ['PIZZA_DIAVOLO','Pizza','Pizza Diavolo','Tomatensauce, Mozzarella, scharfe Salami, Peperoni',9.5,17],
  ['CALZONE','Calzone','Calzone','Gefuellte Pizza mit Schinken, Champignons und Kaese',9.5,17],
  // --- Pasta (Rigatoni oder Spaghetti) ---
  ['PASTA_NAPOLETANA','Pasta','Pasta Napoletana','Rigatoni oder Spaghetti mit Tomatensauce, vegetarisch',6.0,13],
  ['PASTA_BOLOGNESE','Pasta','Pasta Bolognese','Rigatoni oder Spaghetti mit Hackfleisch-Tomatensauce',7.0,14],
  ['PASTA_CARBONARA','Pasta','Pasta Carbonara','Rigatoni oder Spaghetti mit Schinken und Sahnesauce',7.0,14],
  ['PASTA_SAHNE','Pasta','Pasta Sahne','Rigatoni oder Spaghetti mit Sahnesauce',6.0,13],
  ['PASTA_MARE','Pasta','Pasta Mare','Rigatoni oder Spaghetti mit Meeresfruechten und Tomatensauce',8.0,15],
  ['PASTA_TONNO','Pasta','Pasta Tonno','Rigatoni oder Spaghetti mit Sahnesauce und Thunfisch',8.0,15],
  // --- Gnocchi ---
  ['GNOCCHI_GORGONZOLA','Gnocchi','Gnocchi Gorgonzola','Gnocchi mit Gorgonzola-Sahnesauce',8.0,14],
  ['GNOCCHI_BOLOGNESE','Gnocchi','Gnocchi Bolognese','Gnocchi mit Hackfleisch-Tomatensauce',8.0,14],
  // --- Lasagne / Auflauf ---
  ['LASAGNE','Lasagne','Lasagne','Hausgemachte Lasagne mit Hackfleisch und Bechamel',8.0,18],
  ['LASAGNE_SPINAT','Lasagne','Lasagne mit Spinat','Lasagne mit Spinat und Sahnesauce, vegetarisch',8.0,18],
  ['RIGATONI_AL_FORNO','Lasagne','Rigatoni al Forno','Ueberbackene Rigatoni mit Sahne-Hackfleisch',7.0,17],
  // --- Pide (tuerkisch, Namen bleiben) ---
  ['PIDE_KAESE','Pide','Pide mit Kaese','Tuerkisches Fladenbrot mit Kaese ueberbacken',8.5,16],
  ['PIDE_SUCUK_EI','Pide','Pide mit Sucuk und Ei','Tuerkisches Fladenbrot mit Sucuk und Ei',9.5,16],
  ['PIDE_HACKFLEISCH','Pide','Pide mit Hackfleisch','Fladenbrot mit gehacktem Rindfleisch, Peperoni und Paprika',9.5,16],
  ['PIDE_SPINAT_SCHAFSKAESE','Pide','Pide mit Spinat und Schafskaese','Fladenbrot mit Spinat, Kaese und Schafskaese',9.5,16],
  // --- Doener / Drehspiess (tuerkisch, Namen bleiben) ---
  ['DONER_FLADENBROT','Doener','Doener im Fladenbrot','Doenerfleisch im Fladenbrot mit Salat und Sauce',6.5,10],
  ['DONER_BOX','Doener','Doener Box','Doenerfleisch mit Pommes in der Box',8.0,10],
  ['DONER_TELLER','Doener','Doener Teller','Doenerfleisch mit Reis oder Pommes und Salat',10.5,12],
  ['ISKENDER_TELLER','Doener','Iskender Teller','Iskender mit geroesteten Brotstuecken, Tomatensauce und Joghurt',12.5,14],
  ['DONER_VEGETARISCH','Doener','Vegetarischer Doener im Fladenbrot','Fladenbrot mit Gemuese, Salat und Sauce, vegetarisch',6.5,10],
  // --- Salate ---
  ['SALAT_GEMISCHT','Salat','Gemischter Salat','Blattsalat, Tomaten, Gurken, Zwiebeln',5.0,8],
  ['SALAT_COBAN','Salat','Coban Salat','Tuerkischer Hirtensalat mit Tomaten, Gurken, Zwiebeln und Schafskaese',6.0,8],
  ['SALAT_GRIECHISCH','Salat','Griechischer Salat','Tomaten, Gurken, Schafskaese, Peperoni, Oliven',7.0,9],
  ['SALAT_THUNFISCH','Salat','Thunfischsalat (Nizza)','Gemischter Salat mit Thunfisch, Ei und Oliven',7.0,9],
  ['SALAT_DONER','Salat','Doener Salat','Gemischter Salat mit Doenerfleisch und Schafskaese',7.5,10],
  // --- Vorspeisen / Beilagen ---
  ['VORSPEISE_TOMATE_MOZZARELLA','Vorspeise','Tomate-Mozzarella','Frische Tomaten mit Mozzarella und Basilikum',6.0,8],
  ['PIZZABROT','Vorspeise','Pizzabrot','Ofenfrisches Pizzabrot mit Kaese oder Tomatensauce',4.5,10],
  ['BEILAGE_POMMES','Beilage','Pommes Frites','Portion Pommes mit Dip',4.0,8],
  // --- Getraenke (Ayran tuerkisch, bleibt) ---
  ['DRINK_COLA','Getraenk','Cola 0,5l','Kalte Cola, 0,5 Liter',2.9,1],
  ['DRINK_AYRAN','Getraenk','Ayran','Tuerkisches Joghurtgetraenk, 0,25 Liter',2.2,1],
  ['DRINK_WASSER','Getraenk','Mineralwasser 0,5l','Mineralwasser, 0,5 Liter',2.5,1],
  // --- Dessert ---
  ['DESSERT_TIRAMISU','Dessert','Tiramisu','Hausgemachtes Tiramisu',5.0,2],
].map(([artikel_id, kategorie, name, beschreibung, preis_eur, vorbereitung_min]) => ({
  artikel_id, kategorie, name, beschreibung, preis_eur, vorbereitung_min, verfuegbar: true,
}));

// 1) Data-File (Artefakt / Quelle der Wahrheit) schreiben
const dataFile = {
  name: 'Steinofen Pizzeria Karlsruhe - Speisekarte',
  note: 'Aus dem oeffentlichen PDF kuratiert. Beschreibungen Deutsch, tuerkische Namen beibehalten. Preise teils Demo-Schaetzwerte.',
  items: menu,
};
fs.writeFileSync(path.join(root, 'data', 'lieferdienst-speisekarte.json'), JSON.stringify(dataFile, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'secrets', 'insert-body.json'), JSON.stringify({ data: menu }));
console.log('Data-File geschrieben:', menu.length, 'Artikel');
const cats = {};
menu.forEach((m) => { cats[m.kategorie] = (cats[m.kategorie] || 0) + 1; });
console.log('Kategorien:', JSON.stringify(cats));

// curl-Helper
function api(method, urlPath, body) {
  const args = ['-s', '--max-time', '45', '-X', method, '-H', `X-N8N-API-KEY: ${KEY}`, '-w', '\n__CODE__%{http_code}'];
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

function getRows() {
  const res = api('GET', `/data-tables/${TID}/rows?limit=200`);
  const a = res.json && (res.json.data || res.json);
  return Array.isArray(a) ? a : [];
}

(function main() {
  let rows = getRows();
  console.log('\nAlte Zeilen:', rows.length);

  // 2) Alte Zeilen loeschen - mehrere Delete-Formate durchprobieren
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const attempts = [
      () => api('DELETE', `/data-tables/${TID}/rows?filter=${encodeURIComponent(JSON.stringify({ type: 'or', filters: ids.map((id) => ({ columnName: 'id', condition: 'eq', value: id })) }))}`),
      () => api('DELETE', `/data-tables/${TID}/rows`, { filter: { type: 'or', filters: ids.map((id) => ({ columnName: 'id', condition: 'eq', value: id })) } }),
      () => api('DELETE', `/data-tables/${TID}/rows`, { ids }),
    ];
    let deleted = false;
    for (let i = 0; i < attempts.length && !deleted; i++) {
      const res = attempts[i]();
      console.log(`Delete-Versuch ${i + 1}: HTTP ${res.code}`);
      if (res.code >= 200 && res.code < 300) { deleted = true; console.log('  -> erfolgreich'); }
      else console.log('  ->', JSON.stringify(res.json).slice(0, 160));
    }
    if (!deleted) {
      // Fallback: einzeln per Pfad loeschen
      let ok = 0;
      for (const id of ids) { const res = api('DELETE', `/data-tables/${TID}/rows/${id}`); if (res.code >= 200 && res.code < 300) ok++; }
      console.log(`Einzel-Delete per Pfad: ${ok}/${ids.length} geloescht`);
    }
    rows = getRows();
    console.log('Zeilen nach Loeschen:', rows.length);
  }

  if (rows.length > 0) {
    console.log('\nABBRUCH: Alte Zeilen konnten nicht geloescht werden. Insert uebersprungen, um Dubletten zu vermeiden.');
    console.log('Data-File ist geschrieben; Delete-Format muss angepasst werden.');
    return;
  }

  // 3) Neue Zeilen einfuegen - bulk, sonst einzeln
  let inserted = 0;
  const bulk = api('POST', `/data-tables/${TID}/rows`, { data: menu });
  console.log('\nInsert bulk: HTTP', bulk.code);
  if (bulk.code >= 200 && bulk.code < 300) {
    inserted = menu.length;
  } else {
    console.log('  bulk-Antwort:', JSON.stringify(bulk.json).slice(0, 160));
    for (const item of menu) {
      const r1 = api('POST', `/data-tables/${TID}/rows`, { data: [item] });
      if (r1.code >= 200 && r1.code < 300) { inserted++; continue; }
      const r2 = api('POST', `/data-tables/${TID}/rows`, { data: item });
      if (r2.code >= 200 && r2.code < 300) { inserted++; continue; }
      console.log('  Insert fehlgeschlagen:', item.artikel_id, 'HTTP', r1.code, '/', r2.code, JSON.stringify(r1.json).slice(0, 120));
    }
  }
  console.log('Eingefuegt:', inserted, '/', menu.length);

  // 4) Verifizieren
  const after = getRows();
  console.log('\nZeilen final:', after.length);
  const sample = after.slice(0, 3).map((r) => `${r.artikel_id}=${r.name} (${r.preis_eur}EUR)`);
  console.log('Stichprobe:', sample.join(' | '));
  const turkish = after.filter((r) => /Doener|Iskender|Sucuk|Coban|Ayran|Pide/.test(r.name)).map((r) => r.name);
  console.log('Tuerkische Namen erhalten:', turkish.join(', '));
})();
