#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { buildHardenedVapiHrAwsWorkflow } = require('./build-hardened-vapi-hr-aws-workflow');

const root = path.resolve(__dirname, '..');
const workflowId = '4crLlS12OBOlTN2P';
const baseUrl = 'https://srv1651618.hstgr.cloud/api/v1';

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
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data || '{}'); } catch { json = { _raw: data.slice(0, 500) }; }
          resolve({ code: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function validate(workflow) {
  const names = new Set(workflow.nodes.map((node) => node.name));
  const json = JSON.stringify(workflow);
  const checks = [
    ['gateway', names.has('Gateway absichern')],
    ['rate limit', json.includes('VAPI_RATE_LIMIT_MAX_CALLS_PER_WINDOW')],
    ['assistant request', json.includes('assistant-request')],
    ['dedupe', json.includes('processedCallIds')],
    ['aws payload', names.has('AWS Payload bauen')],
    ['aws api gateway', names.has('AWS Backend speichern (API Gateway)')],
    ['aws env', json.includes('AWS_HR_API_URL')],
    ['direct variants disabled', workflow.nodes.find((node) => node.name === 'AWS DynamoDB upsert (Direktvariante)')?.disabled === true],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) throw new Error(`AWS-Hardening-Validierung fehlgeschlagen: ${failed.map(([name]) => name).join(', ')}`);
}

async function main() {
  const liveRes = await request('GET', `/workflows/${workflowId}`);
  if (liveRes.code < 200 || liveRes.code >= 300 || !Array.isArray(liveRes.json.nodes)) {
    throw new Error(`AWS-Demo-Workflow konnte nicht geladen werden: HTTP ${liveRes.code}`);
  }

  const live = liveRes.json;
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupDir = path.join(root, 'backups', ts);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'vapi-hr-aws-demo-before-hardening.json'), `${JSON.stringify(live, null, 2)}\n`);

  const hardened = buildHardenedVapiHrAwsWorkflow();
  validate(hardened);

  const body = {
    name: live.name || hardened.name,
    nodes: hardened.nodes,
    connections: hardened.connections,
    settings: { executionOrder: live.settings?.executionOrder || hardened.settings?.executionOrder || 'v1' },
  };

  const updateRes = await request('PUT', `/workflows/${workflowId}`, body);
  if (updateRes.code < 200 || updateRes.code >= 300) {
    throw new Error(`PUT fehlgeschlagen: HTTP ${updateRes.code} ${JSON.stringify(updateRes.json).slice(0, 300)}`);
  }

  const verifyRes = await request('GET', `/workflows/${workflowId}`);
  if (verifyRes.code < 200 || verifyRes.code >= 300) throw new Error(`Verify fehlgeschlagen: HTTP ${verifyRes.code}`);
  validate(verifyRes.json);

  console.log('backup', path.relative(root, path.join(backupDir, 'vapi-hr-aws-demo-before-hardening.json')));
  console.log('updated_http', updateRes.code);
  console.log('active', verifyRes.json.active);
  console.log('nodes', verifyRes.json.nodes.length);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
