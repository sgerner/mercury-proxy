# Test Plan

## 1. Environment Setup
```bash
# Start the server locally
export RELAY_SHARED_SECRET=testsecret
export RELAY_ENCRYPTION_KEY_B64=$(openssl rand -base64 32)
npm start
```

## 2. Test Cases (Curl)

### A. Health Check
```bash
curl -v http://localhost:3000/healthz
# Expect 200 { "ok": true }
curl -v http://localhost:3000/readyz
# Expect 200 { "ready": true }
```

### B. Signature Verification
**Generate Signature (Node.js REPL):**
```javascript
const crypto = require('crypto');
const secret = 'testsecret';
const ts = Date.now();
const nonce = crypto.randomBytes(8).toString('hex');
const body = JSON.stringify({ company_id: 'test', encrypted_key: '...', mercury: { method: 'GET', path: '/api/v1/accounts' } });
const payload = `${ts}.${nonce}.POST./mercury/request.${body}`;
const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
console.log(`TS=${ts} NONCE=${nonce} SIG=${sig} BODY='${body}'`);
```

**Valid Request:**
```bash
curl -v -X POST http://localhost:3000/mercury/request \
  -H "Content-Type: application/json" \
  -H "X-Relay-Timestamp: <TS>" \
  -H "X-Relay-Nonce: <NONCE>" \
  -H "X-Relay-Signature: <SIG>" \
  -d '<BODY>'
# Expect 400/502 (if key invalid/upstream fails) or 200 (if upstream succeeds)
# Expect 403 if path not in allowlist
```

**Invalid Signature:**
Change one char in signature.
```bash
# Expect 401 Authentication failed
```

### C. Replay Protection
Run the **Valid Request** command twice with the exact same headers.
1. First time: Processed.
2. Second time: `401 Authentication failed` (Nonce already used).

### D. Timestamp Skew
Generate signature with `ts = Date.now() - 600000` (10 mins ago).
```bash
# Expect 401 Authentication failed (Timestamp outside valid window)
```

### E. Rate Limiting
Run the valid request in a loop (e.g., 150 times).
```bash
for i in {1..150}; do curl ... ; done
# Expect eventually 429 Too Many Requests
```

### F. Allowlist
Try to request a path not in allowlist, e.g., `/api/v1/admin`.
```bash
# Expect 403 Path not allowed
```

### G. Binary/PDF
(Requires valid Mercury Key)
Target path `/api/v1/statements/{id}/pdf`.
Verify output is binary and `Content-Type: application/pdf`.

```