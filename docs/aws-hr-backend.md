# AWS-Backend für den Vapi-HR-Workflow

Recherche + Referenz-Architektur, wie der bestehende Workflow
**„Vapi HR Bewerberprotokoll an Slack (Prod)"** zusätzlich an ein AWS-Backend
angebunden wird, damit Bewerberprotokolle dauerhaft, abfragbar und auditierbar
gespeichert werden – statt nur als flüchtige Slack-Nachricht.

> Status: **Konzept + nicht-aktivierter Demo-Workflow.** Nichts hiervon ist in
> der Live-Umgebung deployt. Der Workflow `n8n-vapi-slack-aws-workflow.json` ist
> importierbar, aber bewusst **nicht aktiv** und die Direkt-Nodes sind *disabled*.

---

## 1. Warum AWS hinter den HR-Flow?

Heute endet ein Vapi-Anruf so: `Webhook → LLM-Analyse → Slack`. Das Protokoll
existiert danach nur in Slack. Probleme:

- **Keine Persistenz / kein Audit-Trail** – Slack-Retention ist kein Aktenarchiv.
- **Nicht abfragbar** – „Zeig mir alle Bewerber mit Score ≥ 8 für Rolle X" geht nicht.
- **Keine Weiterverarbeitung** – kein ATS-Export, keine Reports, keine DSGVO-Löschfristen.

Ein AWS-Backend löst genau das: strukturierte Speicherung (DynamoDB), Roh-Archiv
(S3), und eine saubere API-Grenze (API Gateway + Lambda), an die n8n nur noch
JSON schickt.

---

## 2. Ziel-Architektur (empfohlen)

```
Vapi  →  n8n (HR-Workflow)
                │  HTTPS POST { bewerber: {...} }   (SigV4-signiert, IAM)
                ▼
        API Gateway (HTTP API, IAM-Auth)
                │  Proxy-Integration
                ▼
        Lambda  (Node.js 20)  ──►  DynamoDB  (hr_bewerberprotokolle)   [strukturiert, abfragbar]
                │
                └────────────────►  S3        (hr-bewerber-archiv)      [Roh-JSON/Transkript]
                                       │
                       (optional)      └──►  SNS / SES  (Recruiting-Benachrichtigung)
```

**Warum API Gateway + Lambda und nicht n8n → DynamoDB direkt?**

| Kriterium | API Gateway + Lambda (empfohlen) | n8n schreibt direkt (DynamoDB/S3-Node) |
|---|---|---|
| Kopplung | n8n kennt nur 1 URL, AWS-Interna gekapselt | n8n kennt Tabellen, Buckets, Schema |
| Validierung / Idempotenz | zentral in Lambda | muss im Workflow nachgebaut werden |
| IAM-Scope | n8n braucht nur `execute-api:Invoke` | n8n-Key darf direkt in Tabelle/Bucket schreiben |
| Wiederverwendung | gleiches Backend für andere Quellen (ATS, Web) | an n8n gebunden |
| Aufwand | etwas mehr Setup (Lambda+IaC) | schneller, aber spröder |

Die Direkt-Variante ist als **disabled** Referenz-Nodes im Demo-Workflow enthalten
(`AWS DynamoDB upsert (Direktvariante)`, `AWS S3 Transkript-Archiv (Direktvariante)`).

---

## 3. DynamoDB-Tabelle

| Attribut | Typ | Rolle |
|---|---|---|
| `bewerber_id` | String (S) | **Partition Key** – Vapi `call.id`, idempotent |
| `kandidat_name` | String | |
| `position` | String | |
| `empfehlung` | String | `einladen` / `pruefen` / `ablehnen` |
| `score` | Number | 1–10 |
| `kurzzusammenfassung` | String | |
| `staerken` | List | |
| `risiken` | List | |
| `fehlende_informationen` | List | |
| `erstellt_am` | String (ISO 8601) | |
| `quelle` | String | `vapi-n8n` |

- **Billing:** `PAY_PER_REQUEST` (On-Demand) – für Bewerber-Volumen ideal, keine Kapazitätsplanung.
- **Encryption at Rest:** standardmäßig aktiv (AWS-owned key; für PII besser KMS-CMK).
- Optional GSI: `empfehlung-score-index` (PK `empfehlung`, SK `score`) für „alle einzuladenden, nach Score".

---

## 4. Lambda-Handler (Node.js 20, AWS SDK v3)

```js
// index.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE = process.env.HR_TABLE;
const BUCKET = process.env.HR_BUCKET;

export const handler = async (event) => {
  const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  const b = body?.bewerber;
  if (!b?.bewerber_id) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "bewerber_id fehlt" }) };
  }

  const item = { ...b, score: Number(b.score || 0), erstellt_am: b.erstellt_am || new Date().toISOString() };

  // 1) strukturierter Datensatz (idempotent via Partition Key)
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));

  // 2) Roh-Archiv (S3) – getrennt, für Audit/DSGVO
  if (BUCKET) {
    const key = `bewerber/${item.erstellt_am.slice(0, 10)}/${item.bewerber_id}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, ContentType: "application/json",
      Body: JSON.stringify(item),
    }));
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, bewerber_id: item.bewerber_id }) };
};
```

---

## 5. IaC – AWS SAM (minimal, deploybar)

```yaml
# template.yaml  →  sam build && sam deploy --guided
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Resources:
  HrTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: hr_bewerberprotokolle
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions: [{ AttributeName: bewerber_id, AttributeType: S }]
      KeySchema: [{ AttributeName: bewerber_id, KeyType: HASH }]
      SSESpecification: { SSEEnabled: true }

  HrArchive:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: hr-bewerber-archiv-<dein-suffix>
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      LifecycleConfiguration:
        Rules: [{ Id: dsgvo-loeschfrist, Status: Enabled, ExpirationInDays: 180 }]

  HrIngest:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs20.x
      Handler: index.handler
      CodeUri: ./src
      Environment:
        Variables: { HR_TABLE: !Ref HrTable, HR_BUCKET: !Ref HrArchive }
      Policies:
        - DynamoDBWritePolicy: { TableName: !Ref HrTable }
        - S3WritePolicy: { BucketName: !Ref HrArchive }
      Events:
        Api:
          Type: HttpApi
          Properties: { Path: /applicants, Method: POST }

Outputs:
  ApiUrl:
    Value: !Sub "https://${ServerlessHttpApi}.execute-api.${AWS::Region}.amazonaws.com/applicants"
```

`ApiUrl` aus dem Output wird zu `AWS_HR_API_URL` in der n8n-`.env`.

---

## 6. Anbindung in n8n

### Variante 1 – API Gateway (im Demo-Workflow aktiv)

Node **„AWS Backend speichern (API Gateway)"** (`httpRequest`):
- `authentication: predefinedCredentialType`, `nodeCredentialType: aws`
  → n8n signiert den Request automatisch per **SigV4** mit der AWS-Credential.
- `url: {{ $env.AWS_HR_API_URL }}`
- Body: `{ "bewerber": $json.aws_item }`
- `continueOnFail: true` → eine AWS-Störung blockt die Slack-Antwort an HR nicht.

> Hinweis: API Gateway muss dafür auf **IAM-Authorizer** stehen. Alternativ ein
> API-Key-Authorizer + Header `x-api-key` (dann keine AWS-Credential nötig).

### Variante 2 – Direkt (disabled Referenz-Nodes)

- **DynamoDB** `n8n-nodes-base.awsDynamoDb`, `operation: upsert`,
  `tableName`, `dataToSend: defineBelow`, Felder via `fieldsUi.fieldValues`.
- **S3** `n8n-nodes-base.awsS3`, `operation: upload`, `bucketName`, `fileName`, `fileContent`.

Beide nutzen die n8n-Credential **„AWS" (IAM)**: Access Key ID + Secret + Region.

### Benötigte Env-Variablen (VPS `.env`)

```
AWS_HR_API_URL=https://<api-id>.execute-api.eu-central-1.amazonaws.com/applicants
AWS_HR_TABLE=hr_bewerberprotokolle
AWS_HR_BUCKET=hr-bewerber-archiv-<suffix>
```

Die AWS-Credential selbst wird **nicht** als Env gesetzt, sondern als n8n-Credential
(verschlüsselt im n8n-Datenvolume) angelegt und dem Node zugewiesen.

---

## 7. IAM – least privilege für den n8n-Key

Nur das Nötigste. Bei Variante 1 reicht für n8n sogar nur `execute-api:Invoke`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "InvokeHrApi", "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:eu-central-1:<account-id>:<api-id>/*/POST/applicants" }
  ]
}
```

Für die Direkt-Variante zusätzlich `dynamodb:PutItem` auf die Tabelle und
`s3:PutObject` auf `arn:aws:s3:::hr-bewerber-archiv-*/*` – **kein** `*`.

---

## 8. Sicherheit & DSGVO (Bewerberdaten = personenbezogen)

- **Region:** `eu-central-1` (Frankfurt) wegen DSGVO/Datenresidenz.
- **Verschlüsselung:** DynamoDB SSE + S3 SSE (besser KMS-CMK mit Rotation).
- **Löschfristen:** S3-Lifecycle-Rule (`ExpirationInDays`) + DynamoDB-TTL-Attribut
  als technische Umsetzung des „Recht auf Vergessenwerden".
- **Zugriff:** IAM least-privilege, S3 Public Access vollständig geblockt.
- **Transport:** ausschließlich HTTPS/TLS (API Gateway erzwingt das).
- **Kein Secret im Workflow-JSON:** URLs via `$env`, AWS-Key als n8n-Credential.

---

## 9. Kosten (grobe Größenordnung, eu-central-1)

Bei z. B. 1.000 Bewerbergesprächen/Monat praktisch **Cent-Bereich**:
DynamoDB On-Demand ~1.000 Writes, Lambda ~1.000 Invocations (Free Tier deckt das
meist), S3 ~1.000 kleine Objekte, API Gateway HTTP API ~1.000 Requests. Der
LLM-Call (OpenRouter) bleibt der dominante Kostenpunkt, nicht AWS.

---

## 10. Von Demo zu Live – Checkliste

1. `sam build && sam deploy --guided` → `ApiUrl` notieren.
2. API Gateway Authorizer wählen (IAM **oder** API-Key) – Workflow-Node entsprechend.
3. n8n-Credential **„AWS"** (IAM, least-privilege) anlegen.
4. `AWS_HR_API_URL` / `AWS_HR_TABLE` / `AWS_HR_BUCKET` in VPS-`.env`, `docker compose up -d`.
5. `n8n-vapi-slack-aws-workflow.json` importieren, AWS-Credential im API-GW-Node zuweisen.
6. Mit einem Vapi-Testcall verifizieren: DynamoDB-Item + S3-Objekt + Slack-Nachricht.
7. Erst dann den Workflow **Active** schalten (und den alten ggf. deaktivieren).
