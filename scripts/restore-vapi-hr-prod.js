#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const root = path.resolve(__dirname, '..');
const workflowId = 'VapiHrSlackProd';
const baseUrl = 'https://srv1651618.hstgr.cloud/api/v1';
const sourceFile = path.join(root, 'n8n-vapi-slack-workflow-v3-prod.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function request(method, urlPath, body) {
  const key = fs.readFileSync(path.join(root, 'secrets', 'n8n-api-key'), 'utf8').trim();
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      baseUrl + urlPath,
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

function restoreNode(live, sourceByName, name) {
  const liveNode = live.nodes.find((node) => node.name === name);
  const sourceNode = sourceByName.get(name);
  if (!liveNode || !sourceNode) throw new Error(`Node fehlt: ${name}`);

  liveNode.parameters = clone(sourceNode.parameters);
  liveNode.type = sourceNode.type;
  liveNode.typeVersion = sourceNode.typeVersion;
}

function validate(workflow) {
  const payload = workflow.nodes.find((node) => node.name === 'Payload extrahieren');
  const prep = workflow.nodes.find((node) => node.name === 'Protokoll aufbereiten');
  const slack = workflow.nodes.find((node) => node.name === 'Slack Nachricht senden');
  const webhook = workflow.nodes.find((node) => node.name === 'Vapi Call Webhook');
  const response = workflow.nodes.find((node) => node.name === 'Webhook Antwort');
  const json = JSON.stringify(workflow);

  const checks = [
    ['workflow id', workflow.id === workflowId],
    ['payload restored', Boolean(payload?.parameters?.jsCode) && !json.includes('my_new_field')],
    ['protocol restored', Boolean(prep?.parameters?.jsCode) && !json.includes('myNewField')],
    ['hr content', /Bewerbergespräch|Kandidat|gesamt_score|empfehlung/i.test(prep?.parameters?.jsCode || '')],
    ['slack env', slack?.parameters?.url === '={{ $env.SLACK_WEBHOOK_URL }}'],
    ['response node kept', Boolean(response)],
    ['webhook response mode kept', webhook?.parameters?.responseMode === 'responseNode'],
    ['no steinofen leakage', !/Steinofen|Lieferdienst|Speisekarte|Telegram|Ayran|Pizza/i.test(json)],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) throw new Error(`Restore-Validierung fehlgeschlagen: ${failed.map(([name]) => name).join(', ')}`);
}

async function main() {
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const sourceByName = new Map(source.nodes.map((node) => [node.name, node]));

  const liveRes = await request('GET', `/workflows/${workflowId}`);
  if (liveRes.code < 200 || liveRes.code >= 300 || !Array.isArray(liveRes.json.nodes)) {
    throw new Error(`Live-Workflow konnte nicht geladen werden: HTTP ${liveRes.code}`);
  }

  const live = liveRes.json;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupDir = path.join(root, 'backups', ts);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'vapi-hr-prod-before-restore.json'), `${JSON.stringify(live, null, 2)}\n`);

  for (const name of [
    'Payload extrahieren',
    'OpenRouter LLM Analyse',
    'Protokoll aufbereiten',
    'Slack Nachricht senden',
  ]) {
    restoreNode(live, sourceByName, name);
  }

  const webhook = live.nodes.find((node) => node.name === 'Vapi Call Webhook');
  if (webhook) webhook.parameters.responseMode = 'responseNode';

  live.connections['Payload extrahieren'] = {
    main: [[{ node: 'OpenRouter LLM Analyse', type: 'main', index: 0 }]],
  };
  live.connections['OpenRouter LLM Analyse'] = {
    main: [[{ node: 'Protokoll aufbereiten', type: 'main', index: 0 }]],
  };
  live.connections['Protokoll aufbereiten'] = {
    main: [[{ node: 'Slack Nachricht senden', type: 'main', index: 0 }]],
  };
  live.connections['Slack Nachricht senden'] = {
    main: [[{ node: 'Webhook Antwort', type: 'main', index: 0 }]],
  };

  validate(live);

  const body = {
    name: live.name,
    nodes: live.nodes,
    connections: live.connections,
    settings: { executionOrder: live.settings?.executionOrder || 'v1' },
  };
  const updateRes = await request('PUT', `/workflows/${workflowId}`, body);
  if (updateRes.code < 200 || updateRes.code >= 300) {
    throw new Error(`PUT fehlgeschlagen: HTTP ${updateRes.code} ${JSON.stringify(updateRes.json).slice(0, 300)}`);
  }

  console.log('backup', path.relative(root, path.join(backupDir, 'vapi-hr-prod-before-restore.json')));
  console.log('updated_http', updateRes.code);
  console.log('nodes', live.nodes.length);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
