#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { buildHardenedVapiHrWorkflow } = require('./build-hardened-vapi-hr-workflow');

const root = path.resolve(__dirname, '..');

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

const awsPayloadCode = `const p = $('Protokoll aufbereiten').first().json;
const now = new Date().toISOString();
const callId = p.call_id || ('call-' + Date.now());

function arr(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : (value ? [String(value)] : []);
}

const item = {
  bewerber_id: String(callId),
  kandidat_name: p.candidate_name || 'Nicht genannt',
  position: p.role || 'Nicht genannt',
  empfehlung: p.recommendation || 'pruefen',
  score: Number(p.score || 0),
  kurzzusammenfassung: p.summary || '',
  motivation: p.motivation || '',
  fachliche_eignung: p.fachliche_eignung || '',
  kommunikation: p.kommunikation || '',
  verfuegbarkeit: p.verfuegbarkeit || '',
  gehaltsvorstellung: p.gehaltsvorstellung || '',
  staerken: arr(p.staerken),
  risiken: arr(p.risiken),
  fehlende_informationen: arr(p.fehlende_informationen),
  caller_number: p.caller_number || '',
  erstellt_am: now,
  quelle: 'vapi-n8n',
  status: p.status || 'completed_report'
};

const s3_key = 'bewerber/' + now.slice(0, 10) + '/' + item.bewerber_id + '.json';
const s3_body = JSON.stringify({ ...item, transcript: p.transcript || '' }, null, 2);

return [{ json: { ...p, aws_item: item, s3_key, s3_body } }];`;

function buildHardenedVapiHrAwsWorkflow() {
  const workflow = buildHardenedVapiHrWorkflow();
  workflow.name = 'Vapi HR Bewerberprotokoll an Slack + AWS Backend (Demo)';
  workflow.id = '4crLlS12OBOlTN2P';
  workflow.active = false;

  workflow.nodes.push(
    {
      parameters: {
        content: [
          '## AWS-Backend (Demo)',
          '',
          '- Enthält denselben Vapi-Gateway-Guard wie Prod.',
          '- AWS wird erst nach erfolgreichem, vollständigem End-of-Call-Report aufgerufen.',
          '- Rate-Limit/No-Consent/Incomplete/Duplicate landen nicht im AWS-Protokoll.',
          '',
          'Env: AWS_HR_API_URL, AWS_HR_TABLE, AWS_HR_BUCKET',
          'Empfohlen: API Gateway -> Lambda -> DynamoDB/S3.',
        ].join('\\n'),
        height: 300,
        width: 520,
        color: 5,
      },
      id: 'aws-setup-note',
      name: 'AWS Setup Hinweis',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [1540, 40],
    },
    codeNode('aws-payload', 'AWS Payload bauen', awsPayloadCode, [1840, 360]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.AWS_HR_API_URL }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'aws',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ { "bewerber": $json.aws_item, "s3_key": $json.s3_key, "s3_body": $json.s3_body } }}',
        options: { timeout: 15000 },
      },
      id: 'aws-apigw',
      name: 'AWS Backend speichern (API Gateway)',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [2100, 260],
      continueOnFail: true,
    },
    {
      parameters: {
        operation: 'upsert',
        tableName: '={{ $env.AWS_HR_TABLE || "hr_bewerberprotokolle" }}',
        dataToSend: 'defineBelow',
        fieldsUi: {
          fieldValues: [
            { fieldId: 'bewerber_id', fieldValue: '={{ $json.aws_item.bewerber_id }}' },
            { fieldId: 'kandidat_name', fieldValue: '={{ $json.aws_item.kandidat_name }}' },
            { fieldId: 'position', fieldValue: '={{ $json.aws_item.position }}' },
            { fieldId: 'empfehlung', fieldValue: '={{ $json.aws_item.empfehlung }}' },
            { fieldId: 'score', fieldValue: '={{ String($json.aws_item.score) }}' },
            { fieldId: 'kurzzusammenfassung', fieldValue: '={{ $json.aws_item.kurzzusammenfassung }}' },
            { fieldId: 'erstellt_am', fieldValue: '={{ $json.aws_item.erstellt_am }}' },
          ],
        },
        additionalFields: {},
      },
      id: 'aws-dynamodb',
      name: 'AWS DynamoDB upsert (Direktvariante)',
      type: 'n8n-nodes-base.awsDynamoDb',
      typeVersion: 1,
      position: [2100, 520],
      disabled: true,
    },
    {
      parameters: {
        operation: 'upload',
        bucketName: '={{ $env.AWS_HR_BUCKET }}',
        fileName: '={{ $json.s3_key }}',
        binaryData: false,
        fileContent: '={{ $json.s3_body }}',
        additionalFields: {},
      },
      id: 'aws-s3',
      name: 'AWS S3 Transkript-Archiv (Direktvariante)',
      type: 'n8n-nodes-base.awsS3',
      typeVersion: 2,
      position: [2100, 720],
      disabled: true,
    },
  );

  const slack = workflow.nodes.find((node) => node.name === 'Slack HR Nachricht senden');
  if (slack) slack.position = [2360, 360];

  workflow.connections['Protokoll aufbereiten'] = {
    main: [[{ node: 'AWS Payload bauen', type: 'main', index: 0 }]],
  };
  workflow.connections['AWS Payload bauen'] = {
    main: [[
      { node: 'AWS Backend speichern (API Gateway)', type: 'main', index: 0 },
      { node: 'AWS DynamoDB upsert (Direktvariante)', type: 'main', index: 0 },
      { node: 'AWS S3 Transkript-Archiv (Direktvariante)', type: 'main', index: 0 },
      { node: 'Slack HR Nachricht senden', type: 'main', index: 0 },
    ]],
  };

  return workflow;
}

function main() {
  const workflow = buildHardenedVapiHrAwsWorkflow();
  const out = path.join(root, 'n8n-vapi-slack-aws-workflow.json');
  fs.writeFileSync(out, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log(out);
}

if (require.main === module) main();

module.exports = { buildHardenedVapiHrAwsWorkflow };
