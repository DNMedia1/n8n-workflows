#!/usr/bin/env node

const assert = require('node:assert/strict');
const { buildHardenedVapiHrWorkflow } = require('./build-hardened-vapi-hr-workflow');

const workflow = buildHardenedVapiHrWorkflow();
const names = new Set(workflow.nodes.map((node) => node.name));
const json = JSON.stringify(workflow);

assert.equal(workflow.id, 'VapiHrSlackProd');
assert.equal(workflow.name, 'Vapi HR Bewerberprotokoll an Slack (Prod)');

[
  'Vapi Gateway Webhook',
  'Gateway absichern',
  'Webhook sofort antworten',
  'Protokoll erstellen?',
  'OpenRouter LLM Analyse',
  'Protokoll aufbereiten',
  'Slack HR Nachricht senden',
  'Guard/Status Slack bauen',
  'Slack Guard/Status senden',
].forEach((name) => assert.ok(names.has(name), `missing node: ${name}`));

const gateway = workflow.nodes.find((node) => node.name === 'Gateway absichern');
const gatewayCode = gateway.parameters.jsCode;

assert.ok(gatewayCode.includes('assistant-request'), 'gateway must handle assistant-request before a call starts');
assert.ok(gatewayCode.includes('end-of-call-report'), 'gateway must handle end-of-call-report after a call');
assert.ok(gatewayCode.includes('VAPI_RATE_LIMIT_MAX_CALLS_PER_WINDOW'), 'gateway must have configurable per-window rate limit');
assert.ok(gatewayCode.includes('VAPI_RATE_LIMIT_MAX_CALLS_PER_DAY'), 'gateway must have configurable daily rate limit');
assert.ok(gatewayCode.includes('blockUntil'), 'gateway must persist caller blocks');
assert.ok(gatewayCode.includes('$getWorkflowStaticData'), 'gateway must persist call guard state across executions');
assert.ok(gatewayCode.includes('processedCallIds'), 'gateway must deduplicate repeated Vapi reports by call id');
assert.ok(gatewayCode.includes('VAPI_WEBHOOK_SECRET'), 'gateway must support authenticated Vapi webhooks');
assert.ok(gatewayCode.includes('VAPI_HR_ASSISTANT_ID'), 'assistant-request must return a saved assistant id');
assert.ok(gatewayCode.includes('no_consent'), 'gateway must branch no-consent calls away from scoring');
assert.ok(gatewayCode.includes('incomplete_call'), 'gateway must branch incomplete calls away from normal scoring');

const response = workflow.nodes.find((node) => node.name === 'Webhook sofort antworten');
assert.ok(JSON.stringify(response.parameters).includes('$json.vapi_response'), 'webhook must respond with the gateway response');

const ifNode = workflow.nodes.find((node) => node.name === 'Protokoll erstellen?');
assert.ok(JSON.stringify(ifNode.parameters).includes('should_process_report'), 'LLM branch must be guarded');

assert.ok(json.includes('SLACK_ALERT_WEBHOOK_URL'), 'guard and error statuses should support a separate alert webhook');
assert.ok(json.includes('SLACK_WEBHOOK_URL'), 'HR Slack webhook must still be env-based');
assert.ok(!json.includes('my_new_field'), 'workflow must not contain n8n default Python demo field');
assert.ok(!json.includes('myNewField'), 'workflow must not contain n8n default JS demo field');
assert.ok(!json.includes('Steinofen'), 'HR workflow must not leak restaurant workflow content');

console.log('Hardened Vapi HR workflow checks passed.');
