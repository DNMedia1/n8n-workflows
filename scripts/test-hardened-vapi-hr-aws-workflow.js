#!/usr/bin/env node

const assert = require('node:assert/strict');
const { buildHardenedVapiHrAwsWorkflow } = require('./build-hardened-vapi-hr-aws-workflow');

const workflow = buildHardenedVapiHrAwsWorkflow();
const names = new Set(workflow.nodes.map((node) => node.name));
const json = JSON.stringify(workflow);

assert.equal(workflow.name, 'Vapi HR Bewerberprotokoll an Slack + AWS Backend (Demo)');

[
  'Vapi Gateway Webhook',
  'Gateway absichern',
  'Webhook sofort antworten',
  'Protokoll erstellen?',
  'OpenRouter LLM Analyse',
  'Protokoll aufbereiten',
  'AWS Payload bauen',
  'AWS Backend speichern (API Gateway)',
  'AWS DynamoDB upsert (Direktvariante)',
  'AWS S3 Transkript-Archiv (Direktvariante)',
  'Slack HR Nachricht senden',
  'Guard/Status Slack bauen',
  'Slack Guard/Status senden',
].forEach((name) => assert.ok(names.has(name), `missing node: ${name}`));

assert.ok(json.includes('assistant-request'), 'AWS workflow must gate calls before assistant start');
assert.ok(json.includes('VAPI_RATE_LIMIT_MAX_CALLS_PER_WINDOW'), 'AWS workflow must include rate limiting');
assert.ok(json.includes('processedCallIds'), 'AWS workflow must deduplicate reports');
assert.ok(json.includes('no_consent'), 'AWS workflow must keep no-consent calls out of scoring/storage');
assert.ok(json.includes('AWS_HR_API_URL'), 'AWS workflow must post to API Gateway env URL');

const protocolConnection = workflow.connections['Protokoll aufbereiten']?.main?.[0]?.map((edge) => edge.node) || [];
assert.deepEqual(protocolConnection, ['AWS Payload bauen'], 'completed reports should go through AWS payload builder');

const awsPayloadTargets = workflow.connections['AWS Payload bauen']?.main?.[0]?.map((edge) => edge.node) || [];
assert.ok(awsPayloadTargets.includes('AWS Backend speichern (API Gateway)'), 'AWS payload must go to API Gateway');
assert.ok(awsPayloadTargets.includes('Slack HR Nachricht senden'), 'Slack should still be sent from AWS payload data');

assert.equal(workflow.nodes.find((node) => node.name === 'AWS DynamoDB upsert (Direktvariante)').disabled, true);
assert.equal(workflow.nodes.find((node) => node.name === 'AWS S3 Transkript-Archiv (Direktvariante)').disabled, true);

console.log('Hardened Vapi HR AWS workflow checks passed.');
