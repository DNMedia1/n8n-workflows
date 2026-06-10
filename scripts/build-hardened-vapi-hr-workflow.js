#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

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

function ifNode(id, name, leftValue, position) {
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
            rightValue: true,
            operator: { type: 'boolean', operation: 'true', singleValue: true },
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

const gatewayCode = `const rawPayload = $json;
const payload = typeof rawPayload.body === 'string'
  ? JSON.parse(rawPayload.body || '{}')
  : (rawPayload.body ?? rawPayload);

function env(name, fallback = '') {
  const value = typeof $env !== 'undefined' ? $env[name] : undefined;
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function header(name) {
  const headers = rawPayload.headers ?? rawPayload.header ?? {};
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return Array.isArray(value) ? value[0] : String(value);
  }
  return '';
}

function transcriptToText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') return entry;
      const speaker = pick(entry.role, entry.speaker, entry.name, 'Sprecher');
      const text = pick(entry.text, entry.message, entry.transcript, entry.content, '');
      return speaker + ': ' + text;
    }).join('\\n');
  }
  return JSON.stringify(value, null, 2);
}

function normalizePhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const plus = raw.startsWith('+') ? '+' : '';
  const digits = raw.replace(/\\D/g, '');
  return digits ? plus + digits : '';
}

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => normalizePhone(entry))
    .filter(Boolean);
}

function clampNumber(value, fallback, min, max) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function hasNoConsent(transcript) {
  const t = String(transcript || '').toLowerCase();
  if (!t) return false;
  return (
    /nicht\\s+einverstanden|keine\\s+aufzeichnung|nicht\\s+aufzeichnen|will\\s+ich\\s+nicht/.test(t) ||
    (/\\bnein\\b/.test(t) && /aufzeichnung|aufnehmen|verarbeitung|daten/.test(t))
  );
}

function hasConsent(transcript) {
  const t = String(transcript || '').toLowerCase();
  return /einverstanden|ja[,\\s]+.*(aufzeichnung|aufnehmen|verarbeitung|daten)|passt|okay|ok/.test(t);
}

const message = payload.message ?? payload;
const eventType = message.type ?? payload.type ?? 'unknown';
const call = message.call ?? payload.call ?? {};
const customer = message.customer ?? payload.customer ?? call.customer ?? {};
const artifact = message.artifact ?? payload.artifact ?? {};
const analysis = message.analysis ?? payload.analysis ?? call.analysis ?? {};
const structured = analysis.structuredData ?? payload.structuredData ?? {};

const callId = String(pick(call.id, message.callId, payload.callId, 'call-' + Date.now()));
const callerNumber = normalizePhone(pick(
  call.from?.phoneNumber,
  call.from?.number,
  call.customer?.number,
  call.customer?.phoneNumber,
  customer.number,
  customer.phoneNumber,
  payload.from?.phoneNumber,
  payload.phoneNumber
));
const callerKey = callerNumber || 'unknown:' + String(pick(header('x-forwarded-for'), header('x-real-ip'), 'no-ip')).split(',')[0].trim();
const now = Date.now();

const webhookSecret = env('VAPI_WEBHOOK_SECRET', '');
const authHeader = header('authorization');
const secretHeader = header('x-vapi-secret');
const authOk = !webhookSecret || secretHeader === webhookSecret || authHeader === 'Bearer ' + webhookSecret || authHeader === webhookSecret;
const securityWarning = webhookSecret ? '' : 'VAPI_WEBHOOK_SECRET ist nicht gesetzt; Webhook ist nicht hart authentifiziert.';

const staticData = $getWorkflowStaticData('global');
staticData.callGuard = staticData.callGuard || {};
const guard = staticData.callGuard;
guard.callers = guard.callers || {};
guard.processedCallIds = guard.processedCallIds || {};

const windowMinutes = clampNumber(env('VAPI_RATE_LIMIT_WINDOW_MINUTES'), 60, 5, 1440);
const maxWindowCalls = clampNumber(env('VAPI_RATE_LIMIT_MAX_CALLS_PER_WINDOW'), 3, 1, 100);
const maxDayCalls = clampNumber(env('VAPI_RATE_LIMIT_MAX_CALLS_PER_DAY'), 8, 1, 500);
const blockDays = clampNumber(env('VAPI_RATE_LIMIT_BLOCK_DAYS'), 7, 1, 365);
const assistantId = env('VAPI_HR_ASSISTANT_ID', '0464f5c2-4927-45b3-9429-e8bc0d6d1323');
const blockedCallers = new Set(parseList(env('VAPI_BLOCKED_CALLERS', '')));

const windowMs = windowMinutes * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const blockMs = blockDays * dayMs;
const cutoff = now - dayMs;

for (const [key, value] of Object.entries(guard.processedCallIds)) {
  if (!value || Number(value) < cutoff) delete guard.processedCallIds[key];
}
for (const [key, value] of Object.entries(guard.callers)) {
  const timestamps = Array.isArray(value.timestamps) ? value.timestamps.filter((ts) => Number(ts) > cutoff) : [];
  value.timestamps = timestamps;
  if (!timestamps.length && (!value.blockUntil || Number(value.blockUntil) < now)) delete guard.callers[key];
}

const callerState = guard.callers[callerKey] || { timestamps: [], blockUntil: 0 };
callerState.timestamps = Array.isArray(callerState.timestamps)
  ? callerState.timestamps.filter((ts) => Number(ts) > cutoff)
  : [];

let status = 'ignored_event';
let shouldProcessReport = false;
let shouldSendStatus = false;
let vapiResponse = { ok: true, ignored: true };
let guardReason = '';

if (!authOk) {
  status = 'unauthorized';
  guardReason = 'Vapi Webhook Authentication fehlgeschlagen.';
  shouldSendStatus = true;
  vapiResponse = { error: 'Unauthorized webhook request.' };
} else if (blockedCallers.has(callerNumber)) {
  status = 'blocked_caller';
  guardReason = 'Anrufer steht in VAPI_BLOCKED_CALLERS.';
  shouldSendStatus = true;
  vapiResponse = { error: 'Diese Nummer ist fuer diesen Telefonassistenten gesperrt.' };
} else if (callerState.blockUntil && Number(callerState.blockUntil) > now) {
  status = 'rate_limited';
  guardReason = 'Anrufer ist bis ' + new Date(Number(callerState.blockUntil)).toISOString() + ' gesperrt.';
  shouldSendStatus = true;
  vapiResponse = { error: 'Diese Nummer hat zu oft angerufen. Bitte versuchen Sie es spaeter erneut oder kontaktieren Sie uns schriftlich.' };
} else if (eventType === 'assistant-request') {
  callerState.timestamps.push(now);
  const recentWindow = callerState.timestamps.filter((ts) => ts > now - windowMs).length;
  const recentDay = callerState.timestamps.filter((ts) => ts > now - dayMs).length;

  if (recentWindow > maxWindowCalls || recentDay > maxDayCalls) {
    callerState.blockUntil = now + blockMs;
    status = 'rate_limited';
    guardReason = 'Rate Limit ueberschritten: ' + recentWindow + '/' + maxWindowCalls + ' im Fenster, ' + recentDay + '/' + maxDayCalls + ' pro Tag.';
    shouldSendStatus = true;
    vapiResponse = { error: 'Diese Nummer hat zu oft angerufen. Bitte versuchen Sie es spaeter erneut oder kontaktieren Sie uns schriftlich.' };
  } else if (!assistantId) {
    status = 'misconfigured';
    guardReason = 'VAPI_HR_ASSISTANT_ID fehlt.';
    shouldSendStatus = true;
    vapiResponse = { error: 'Der Telefonassistent ist gerade nicht konfiguriert.' };
  } else {
    status = 'assistant_allowed';
    vapiResponse = { assistantId };
  }
} else if (eventType === 'end-of-call-report') {
  if (guard.processedCallIds[callId]) {
    status = 'duplicate_report';
    guardReason = 'End-of-Call-Report wurde bereits verarbeitet.';
    shouldSendStatus = true;
    vapiResponse = { ok: true, duplicate: true };
  } else {
    guard.processedCallIds[callId] = now;
    const transcript = transcriptToText(pick(
      message.transcript,
      payload.transcript,
      analysis.transcript,
      call.transcript,
      artifact.transcript,
      artifact.messages,
      payload.messages,
      payload.recording?.transcript
    ));
    const endedReason = String(pick(call.endedReason, call.ended_reason, message.endedReason, payload.endedReason, 'unknown'));
    const durationSeconds = Number(pick(call.durationSeconds, call.duration, payload.durationSeconds, 0)) || 0;
    const noConsent = hasNoConsent(transcript);
    const consentClearlyPresent = hasConsent(transcript);
    const providerError = /error|failed|fault|timeout|silence|no-audio|unknown/i.test(endedReason);
    const tooShort = durationSeconds > 0 && durationSeconds < 45;
    const transcriptTooShort = transcript.trim().length < 180;

    if (noConsent) {
      status = 'no_consent';
      guardReason = 'Kandidat hat Aufnahme/Verarbeitung abgelehnt.';
      shouldSendStatus = true;
    } else if (providerError || tooShort || transcriptTooShort) {
      status = 'incomplete_call';
      guardReason = [
        providerError ? 'EndedReason auffaellig: ' + endedReason : '',
        tooShort ? 'Call zu kurz: ' + durationSeconds + 's' : '',
        transcriptTooShort ? 'Transkript zu kurz oder fehlt.' : ''
      ].filter(Boolean).join(' ');
      shouldSendStatus = true;
    } else {
      status = 'completed_report';
      shouldProcessReport = true;
    }

    const candidateName = pick(
      structured.candidate_name, structured.candidateName, structured.kandidat,
      structured.name, customer.name, payload.candidate_name, 'Nicht genannt'
    );
    const role = pick(
      structured.role, structured.rolle, structured.position,
      payload.role, payload.rolle, 'Nicht genannt'
    );
    const callTime = pick(call.endedAt, call.ended_at, message.endedAt, new Date().toISOString());

    const systemPrompt = [
      'Du bist ein erfahrener HR-Interview-Analyst. Analysiere das Transkript eines Bewerber-Erstgespraechs.',
      '',
      'Regeln:',
      '- Bewerte ausschliesslich auf Basis des Transkripts.',
      '- Erfinde keine Informationen. Fehlende Angaben als "Nicht genannt" markieren.',
      '- Keine Diskriminierung: keine Bewertung geschuetzter Merkmale.',
      '- Antworte nur mit validem JSON ohne Markdown.',
      '- Empfehlung: weiterfuehren | pruefen | ablehnen.',
      '',
      'JSON-Schema:',
      '{',
      '  "kandidat_name": "Name oder Nicht genannt",',
      '  "zielrolle": "Rolle oder Nicht genannt",',
      '  "kurzzusammenfassung": "2-3 Saetze",',
      '  "motivation": "Motivation oder Nicht genannt",',
      '  "fachliche_eignung": "Einschaetzung",',
      '  "kommunikation": "Einschaetzung",',
      '  "verfuegbarkeit": "Starttermin/Kuendigungsfrist oder Nicht genannt",',
      '  "gehaltsvorstellung": "Betrag oder Nicht genannt",',
      '  "staerken": ["..."],',
      '  "risiken": ["..."],',
      '  "fehlende_informationen": ["..."],',
      '  "empfehlung": "pruefen",',
      '  "gesamt_score": 5,',
      '  "score_begruendung": "Sachliche Begruendung"',
      '}'
    ].join('\\n');

    const userMessage = [
      'Kandidat (Metadaten): ' + candidateName,
      'Zielrolle (Metadaten): ' + role,
      'Call-ID: ' + callId,
      '',
      'Transkript:',
      transcript
    ].join('\\n');

    Object.assign(message, {
      _normalized: {
        transcript,
        candidateName,
        role,
        callTime,
        endedReason,
        durationSeconds,
        consentClearlyPresent
      }
    });
    Object.assign(payload, { _systemPrompt: systemPrompt, _userMessage: userMessage });
    vapiResponse = { ok: true, accepted: true, status };
  }
} else {
  status = 'ignored_event';
  vapiResponse = { ok: true, ignored: true, eventType };
}

guard.callers[callerKey] = callerState;

const normalized = message._normalized ?? {};

return [{
  json: {
    event_type: eventType,
    status,
    guard_reason: guardReason,
    security_warning: securityWarning,
    caller_number: callerNumber || 'unknown',
    caller_key: callerKey,
    call_id: callId,
    call_time: normalized.callTime ?? new Date().toISOString(),
    ended_reason: normalized.endedReason ?? '',
    duration_seconds: normalized.durationSeconds ?? 0,
    transcript: normalized.transcript ?? '',
    candidate_name: normalized.candidateName ?? 'Nicht genannt',
    role: normalized.role ?? 'Nicht genannt',
    system_prompt: payload._systemPrompt ?? '',
    user_message: payload._userMessage ?? '',
    should_process_report: shouldProcessReport,
    should_send_status: shouldSendStatus,
    vapi_response: vapiResponse,
    rate_limit: {
      window_minutes: windowMinutes,
      max_calls_per_window: maxWindowCalls,
      max_calls_per_day: maxDayCalls,
      block_days: blockDays,
      caller_calls_24h: callerState.timestamps.length,
      block_until: callerState.blockUntil ? new Date(Number(callerState.blockUntil)).toISOString() : ''
    }
  }
}];`;

const protocolCode = `const prev = $('Gateway absichern').first().json;
const llmResponse = $json;
const rawContent = llmResponse?.choices?.[0]?.message?.content ?? llmResponse?.message?.content ?? '';

let parsed = {};
try {
  const clean = String(rawContent).replace(/\\\`\\\`\\\`json/gi, '').replace(/\\\`\\\`\\\`/g, '').trim();
  parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
} catch (error) {
  parsed = {
    kurzzusammenfassung: 'LLM-Antwort konnte nicht verarbeitet werden.',
    gesamt_score: 1,
    empfehlung: 'pruefen',
    fehlende_informationen: ['LLM-Parsing-Fehler: ' + String(error.message).slice(0, 120)],
    staerken: [],
    risiken: ['LLM-Antwort nicht verarbeitbar - bitte manuell pruefen'],
    score_begruendung: 'Fehler bei der automatischen Auswertung'
  };
}

function val(field, fallback) {
  const value = parsed[field];
  if (value !== undefined && value !== null && String(value).trim() !== '') return String(value);
  return fallback || 'Nicht genannt';
}

function arr(field) {
  const value = parsed[field];
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value.split('\\n').map((line) => line.replace(/^[-*]\\s*/, '').trim()).filter(Boolean);
  }
  return [String(value)];
}

const candidateName = val('kandidat_name', prev.candidate_name);
const role = val('zielrolle', prev.role);
const score = Math.max(1, Math.min(10, Math.round(Number(parsed.gesamt_score) || 5)));
const recommendationRaw = val('empfehlung').toLowerCase();
const recommendation = recommendationRaw.includes('weiter')
  ? 'weiterfuehren'
  : recommendationRaw.includes('ablehn')
    ? 'ablehnen'
    : 'pruefen';

const strengths = arr('staerken');
const risks = arr('risiken');
const missing = arr('fehlende_informationen');

const slackLines = [
  '*Neues Bewerbergespraech ausgewertet*',
  '*Status:* abgeschlossen',
  '*Kandidat:* ' + candidateName,
  '*Zielrolle:* ' + role,
  '*Zeitpunkt:* ' + prev.call_time,
  '*Call-ID:* ' + prev.call_id,
  '*Caller:* ' + prev.caller_number,
  '*EndedReason:* ' + (prev.ended_reason || 'Nicht genannt'),
  '',
  '*Empfehlung:* ' + recommendation,
  '*Score:* ' + score + '/10',
  '',
  '*Kurzfazit:*',
  val('kurzzusammenfassung'),
  '',
  '*Motivation:*',
  val('motivation'),
  '',
  '*Fachliche Eignung:*',
  val('fachliche_eignung'),
  '',
  '*Kommunikation:*',
  val('kommunikation'),
  '',
  '*Verfuegbarkeit:* ' + val('verfuegbarkeit'),
  '*Gehaltsvorstellung:* ' + val('gehaltsvorstellung'),
  '',
  '*Staerken:*',
  ...(strengths.length ? strengths.map((item) => '- ' + item) : ['- Keine klaren Staerken erkannt']),
  '',
  '*Risiken / offene Punkte:*',
  ...(risks.length ? risks.map((item) => '- ' + item) : ['- Keine Risiken erkannt']),
  '',
  '*Score-Begruendung:*',
  val('score_begruendung')
];

if (missing.length) {
  slackLines.push('', '*Fehlende Informationen:*', ...missing.map((item) => '- ' + item));
}

if (prev.security_warning) {
  slackLines.push('', '*Security-Hinweis:* ' + prev.security_warning);
}

slackLines.push('', '_Automatische Vorauswertung - bitte von HR validieren._');

return [{
  json: {
    status: 'completed_report',
    candidate_name: candidateName,
    role,
    recommendation,
    score,
    summary: val('kurzzusammenfassung'),
    motivation: val('motivation'),
    fachliche_eignung: val('fachliche_eignung'),
    kommunikation: val('kommunikation'),
    verfuegbarkeit: val('verfuegbarkeit'),
    gehaltsvorstellung: val('gehaltsvorstellung'),
    staerken: strengths,
    risiken: risks,
    fehlende_informationen: missing,
    score_begruendung: val('score_begruendung'),
    transcript: prev.transcript,
    call_id: prev.call_id,
    caller_number: prev.caller_number,
    slack_text: slackLines.join('\\n'),
    llm_raw: String(rawContent).slice(0, 500)
  }
}];`;

const statusSlackCode = `const ctx = $json;

if (!ctx.should_send_status) return [];

const labels = {
  unauthorized: 'Security: unautorisierter Vapi Webhook',
  blocked_caller: 'Call blockiert: Nummer gesperrt',
  rate_limited: 'Call blockiert: Rate Limit',
  no_consent: 'Call ohne Consent beendet',
  incomplete_call: 'Unvollstaendiger Call',
  duplicate_report: 'Doppelter End-of-Call-Report ignoriert',
  misconfigured: 'Vapi Gateway falsch konfiguriert'
};

const lines = [
  '*' + (labels[ctx.status] || 'Vapi HR Status') + '*',
  '*Status:* ' + ctx.status,
  '*Grund:* ' + (ctx.guard_reason || 'Nicht angegeben'),
  '*Call-ID:* ' + ctx.call_id,
  '*Caller:* ' + ctx.caller_number,
  '*Event:* ' + ctx.event_type,
  '*EndedReason:* ' + (ctx.ended_reason || 'Nicht genannt'),
  '*Dauer:* ' + (ctx.duration_seconds || 0) + 's'
];

if (ctx.rate_limit) {
  lines.push('*Rate Limit:* ' + ctx.rate_limit.caller_calls_24h + ' Calls/24h, Block bis: ' + (ctx.rate_limit.block_until || 'nicht geblockt'));
}
if (ctx.security_warning) lines.push('*Security-Hinweis:* ' + ctx.security_warning);
if (ctx.transcript) lines.push('', '*Transkript-Auszug:*', ctx.transcript.slice(0, 1200));

return [{ json: { slack_text: lines.join('\\n') } }];`;

function buildHardenedVapiHrWorkflow() {
  const nodes = [
    {
      parameters: {
        content: [
          '## Vapi HR Workflow (Prod gehärtet)',
          '',
          '- Nutzt einen Gateway-Webhook fuer assistant-request und end-of-call-report.',
          '- Blockt zu haeufige Anrufer vor dem Call, bevor LLM-/Gesprächskosten entstehen.',
          '- Filtert Event-Typen, prueft optionale Webhook-Auth und dedupliziert call.id.',
          '- No-Consent/Incomplete/Duplicate laufen nicht in die Bewertung.',
          '',
          'Vapi Server URL: https://<N8N_HOST>/webhook/vapi-call-ended',
          'Env: VAPI_WEBHOOK_SECRET, VAPI_HR_ASSISTANT_ID, VAPI_RATE_LIMIT_*',
        ].join('\\n'),
        height: 360,
        width: 560,
        color: 4,
      },
      id: 'sticky-prod-hardening',
      name: 'Workflow Hinweis',
      type: 'n8n-nodes-base.stickyNote',
      typeVersion: 1,
      position: [220, 40],
    },
    {
      parameters: {
        httpMethod: 'POST',
        path: 'vapi-call-ended',
        responseMode: 'responseNode',
        options: {},
      },
      id: 'webhook-gateway',
      name: 'Vapi Gateway Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [260, 460],
      webhookId: 'vapi-call-ended',
    },
    codeNode('code-gateway', 'Gateway absichern', gatewayCode, [520, 460]),
    {
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json.vapi_response }}',
        options: {},
      },
      id: 'respond-gateway',
      name: 'Webhook sofort antworten',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [780, 460],
    },
    ifNode('if-process', 'Protokoll erstellen?', '={{ $json.should_process_report }}', [1040, 460]),
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
            { name: 'X-Title', value: 'Vapi HR Agent' },
          ],
        },
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "model": $env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct", "temperature": 0.1, "response_format": { "type": "json_object" }, "messages": [{ "role": "system", "content": $json.system_prompt }, { "role": "user", "content": $json.user_message }] } }}',
        options: { timeout: 30000 },
      },
      id: 'http-llm',
      name: 'OpenRouter LLM Analyse',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1320, 360],
      continueOnFail: true,
    },
    codeNode('code-protocol', 'Protokoll aufbereiten', protocolCode, [1580, 360]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.SLACK_WEBHOOK_URL }}',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "text": $json.slack_text } }}',
        options: { timeout: 15000 },
      },
      id: 'http-slack-hr',
      name: 'Slack HR Nachricht senden',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1840, 360],
      continueOnFail: true,
    },
    codeNode('code-status-slack', 'Guard/Status Slack bauen', statusSlackCode, [1320, 620]),
    {
      parameters: {
        method: 'POST',
        url: '={{ $env.SLACK_ALERT_WEBHOOK_URL || $env.SLACK_WEBHOOK_URL }}',
        sendBody: true,
        contentType: 'json',
        specifyBody: 'json',
        jsonBody: '={{ { "text": $json.slack_text } }}',
        options: { timeout: 15000 },
      },
      id: 'http-slack-status',
      name: 'Slack Guard/Status senden',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1580, 620],
      continueOnFail: true,
    },
  ];

  return {
    name: 'Vapi HR Bewerberprotokoll an Slack (Prod)',
    nodes,
    connections: {
      'Vapi Gateway Webhook': {
        main: [[{ node: 'Gateway absichern', type: 'main', index: 0 }]],
      },
      'Gateway absichern': {
        main: [[{ node: 'Webhook sofort antworten', type: 'main', index: 0 }]],
      },
      'Webhook sofort antworten': {
        main: [[{ node: 'Protokoll erstellen?', type: 'main', index: 0 }]],
      },
      'Protokoll erstellen?': {
        main: [
          [{ node: 'OpenRouter LLM Analyse', type: 'main', index: 0 }],
          [{ node: 'Guard/Status Slack bauen', type: 'main', index: 0 }],
        ],
      },
      'OpenRouter LLM Analyse': {
        main: [[{ node: 'Protokoll aufbereiten', type: 'main', index: 0 }]],
      },
      'Protokoll aufbereiten': {
        main: [[{ node: 'Slack HR Nachricht senden', type: 'main', index: 0 }]],
      },
      'Guard/Status Slack bauen': {
        main: [[{ node: 'Slack Guard/Status senden', type: 'main', index: 0 }]],
      },
    },
    pinData: {},
    active: false,
    settings: {
      executionOrder: 'v1',
      saveExecutionProgress: false,
      saveManualExecutions: true,
      callerPolicy: 'workflowsFromSameOwner',
    },
    versionId: 'prod-hardening-20260609',
    meta: {
      templateCredsSetupCompleted: false,
    },
    id: 'VapiHrSlackProd',
    tags: [],
  };
}

function main() {
  const workflow = buildHardenedVapiHrWorkflow();
  const out = path.join(root, 'n8n-vapi-hr-workflow-prod-hardened.json');
  fs.writeFileSync(out, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log(out);
}

if (require.main === module) main();

module.exports = { buildHardenedVapiHrWorkflow };
