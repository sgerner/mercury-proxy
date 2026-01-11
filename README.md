# Mercury API Relay

A secure, stateless, static-IP egress relay for calling the Mercury API from serverless environments (like Vercel).

## Overview

Serverless platforms like Vercel often use dynamic IP addresses. Mercury API requires allowlisting specific static IPs for access. This relay allows you to:

1.  Deploy this service on a VPS with a static IP (via CapRover).
2.  Route requests from your Vercel app to this relay.
3.  The relay authenticates the request, decrypts the Mercury API key provided in the request payload, and forwards the request to Mercury using the VPS's static IP.

**Features:**
*   **Secure**: HMAC signature verification for all inbound requests.
*   **Stateless**: No database required. Keys are passed encrypted in the request.
*   **Zero-Trust**: Keys are only decrypted in memory at the moment of the request.
*   **Replay Protection**: Validates request timestamp and nonces (strict in-memory cache).
*   **Rate Limiting**: Built-in protection against abuse.
*   **Binary Streaming**: Supports PDF downloads and other binary responses efficiently.

## Prerequisites

*   **CapRover Server**: A VPS running CapRover (or any server with a static IP).
*   **Node.js**: v18+ for local development.

## 1. Local Setup

1.  **Clone the repo**
2.  **Install dependencies**: `npm install`
3.  **Configure Env**:
    *   Copy `.env.example` to `.env`.
    *   Generate keys:
        *   `RELAY_SHARED_SECRET`: `openssl rand -hex 32`
        *   `RELAY_ENCRYPTION_KEY_B64`: `openssl rand -base64 32`

4.  **Run Locally**: `npm start`

## 2. Deploying to CapRover

### Step 1: Create the App
1.  Log in to your CapRover dashboard.
2.  Create a new app named `mercury-relay` (or similar).
3.  **Enable HTTPS**: After creation, go to "HTTP Settings" and enable "Force HTTPS".

### Step 2: Configure Environment Variables
Go to the "App Configs" tab and add the following Environment Variables:

*   `PORT`: `3000`
*   `LOG_LEVEL`: `info`
*   `RELAY_SHARED_SECRET`: (Long random string).
*   `RELAY_ENCRYPTION_KEY_B64`: (32-byte base64 encoded key).
*   `MERCURY_API_BASE`: `https://api.mercury.com`

**Limits & Security (Optional overrides):**
*   `RELAY_MAX_BODY_BYTES`: `262144` (256KB default)
*   `RELAY_MAX_RESPONSE_BYTES`: `31457280` (30MB default)
*   `RELAY_CONNECT_TIMEOUT_MS`: `5000`
*   `RELAY_RESPONSE_TIMEOUT_MS`: `60000`
*   `RELAY_MAX_SKEW_SECONDS`: `300` (5 min)
*   `RELAY_RL_WINDOW_SECONDS`: `60`
*   `RELAY_RL_MAX_REQUESTS`: `120`
*   `RELAY_ALLOW_ALL_PATHS`: `false` (Default deny. Set `true` ONLY for dev).

### Step 3: Deploy
**Option A: Via GitHub (Recommended)**
1.  Push this code to a GitHub repository.
2.  In CapRover, go to the "Deployment" tab.
3.  Under "Method 3: GitHub/Bitbucket...", configure your repo and branch (main).
4.  Click "Force Build" to deploy.

**Option B: Via Captain CLI**
1.  Install CLI: `npm install -g caprover`
2.  Setup: `caprover serversetup`
3.  Deploy: `caprover deploy` -> Select `mercury-relay`.

### Step 4: Whitelist IP
1.  Find your VPS Public IP (displayed in CapRover dashboard).
2.  Log in to Mercury dashboard.
3.  Add this IP to your API allowlist.

## 3. Usage (Client Side)

### Encrypting the Key (One-time or dynamic)
Use AES-256-GCM. See `src/lib/encryption.js` for reference implementation.

### Making a Request

**Headers Required:**
*   `X-Relay-Timestamp`: Current timestamp (ms).
*   `X-Relay-Nonce`: Random string (unique per request).
*   `X-Relay-Signature`: HMAC-SHA256 signature.

**Signature Payload:**
```
${timestamp}.${nonce}.POST./mercury/request.${rawRequestBody}
```
*Note: rawRequestBody must be the exact string sent in the body.*

**Request Body (Preferred Shape):**
```json
{
  "company_id": "cust_123",
  "connection_id": "conn_456",
  "encrypted_key": "<base64_ciphertext>",
  "mercury": {
    "method": "GET",
    "path": "/api/v1/accounts",
    "query": { "limit": 10 },
    "body": {}
  }
}
```

**Legacy Shape (Supported):**
```json
{
  "company_id": "cust_123",
  "encrypted_key": "...",
  "method": "GET",
  "path": "/api/v1/accounts"
}
```

## 4. Security & Troubleshooting

*   **Signature Failed**: Ensure you are signing the *raw body string* exactly as sent. Ensure timestamp is within 5 minutes.
*   **Replay Detected**: A nonce can only be used once.
*   **Path Blocked**: The relay uses a strict allowlist. Only standard Mercury endpoints are allowed. To allow all in dev, set `RELAY_ALLOW_ALL_PATHS=true`.
*   **Rate Limited**: Default limit is 120 requests / minute per company_id.
*   **Logs**: The relay logs structured JSON. Secrets (keys, bodies) are never logged.

## Migration Guide (Breaking Changes)

*   **Allowlist**: By default, only specific Mercury paths are allowed. If you rely on obscure endpoints, update `src/routes/relay.js` or use `RELAY_ALLOW_ALL_PATHS=true` temporarily.
*   **Signature**: Ensure your signature payload construction matches `${timestamp}.${nonce}.POST./mercury/request.${body}`.
