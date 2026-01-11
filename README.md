# Mercury API Relay

A secure, static-IP egress relay for calling the Mercury API from serverless environments (like Vercel).

## Overview

Serverless platforms like Vercel often use dynamic IP addresses. Mercury API requires allowlisting specific static IPs for access. This relay allows you to:

1.  Deploy this service on a VPS with a static IP (via CapRover).
2.  Route requests from your Vercel app to this relay.
3.  The relay authenticates the request, decrypts the tenant's Mercury API key, and forwards the request to Mercury using the VPS's static IP.

**Features:**
*   **Secure**: HMAC signature verification for all inbound requests.
*   **Multi-tenant**: Stores encrypted Mercury API keys per tenant (Company).
*   **Zero-Trust**: Keys are only decrypted in memory at the moment of the request.
*   **Replay Protection**: Validates request timestamp and nonces.

## Prerequisites

*   **CapRover Server**: A VPS running CapRover.
*   **PostgreSQL Database**: Can be a CapRover One-Click App (Postgres) or an external provider (Supabase, RDS).
*   **Node.js**: For local development.

## 1. Local Setup

1.  **Clone the repo**
2.  **Install dependencies**: `npm install`
3.  **Setup Database**:
    *   Ensure you have a Postgres database running.
    *   Run the following SQL to create the required table:

    ```sql
    CREATE TABLE IF NOT EXISTS company_integrations_mercury (
      company_id TEXT PRIMARY KEY,
      api_key_ciphertext TEXT NOT NULL,
      api_key_last4 TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      rotated_at TIMESTAMP WITH TIME ZONE
    );
    ```

4.  **Configure Env**:
    *   Copy `.env.example` to `.env`.
    *   Generate keys:
        *   `RELAY_SHARED_SECRET`: `openssl rand -hex 32`
        *   `RELAY_ENCRYPTION_KEY_B64`: `openssl rand -base64 32`
    *   Fill in `DATABASE_URL`.

5.  **Run Locally**: `npm start`

## 2. Deploying to CapRover

### Step 1: Create the App
1.  Log in to your CapRover dashboard.
2.  Create a new app named `mercury-relay` (or similar).
3.  **Enable HTTPS**: After creation, go to "HTTP Settings" and enable "Force HTTPS".

### Step 2: Setup Database (If needed)
If you don't have a DB, deploy "PostgreSQL" from the "One-Click Apps" list in CapRover. Note the connection details.

### Step 3: Configure Environment Variables
Go to the "App Configs" tab and add the following Environment Variables:

*   `PORT`: `3000`
*   `LOG_LEVEL`: `info`
*   `RELAY_SHARED_SECRET`: (Generate a long random string. Share this with your Vercel app).
*   `RELAY_ENCRYPTION_KEY_B64`: (Generate using `openssl rand -base64 32`. Keep this safe! If lost, all stored keys are unrecoverable).
*   `DATABASE_URL`: `postgres://user:password@host:5432/dbname` (Use internal network address if DB is also on CapRover, e.g., `srv-captain--postgres`).
*   `MERCURY_API_BASE`: `https://api.mercury.com`

### Step 4: Deploy
**Option A: Via GitHub (Recommended)**
1.  Push this code to a GitHub repository.
2.  In CapRover, go to the "Deployment" tab.
3.  Under "Method 3: GitHub/Bitbucket...", configure your repo and branch (main).
4.  Click "Force Build" to deploy.

**Option B: Via Captain CLI**
1.  Install CLI: `npm install -g caprover`
2.  Setup: `caprover serversetup`
3.  Deploy: `caprover deploy` -> Select `mercury-relay`.

### Step 5: Whitelist IP
1.  Find your VPS Public IP (displayed in CapRover dashboard).
2.  Log in to Mercury dashboard.
3.  Add this IP to your API allowlist.

## 3. Managing Keys

### Encrypting a Key
To add a tenant's key to the database, you must encrypt it first using the **same** `RELAY_ENCRYPTION_KEY_B64` as production.

1.  Locally, ensure your `.env` has the production `RELAY_ENCRYPTION_KEY_B64`.
2.  Run:
    ```bash
    node src/scripts/encrypt-key.js <MERCURY_API_KEY>
    ```
3.  It will output JSON like:
    ```json
    {
      "ciphertext": "...",
      "last4": "1234"
    }
    ```
4.  Insert this into your database:
    ```sql
    INSERT INTO company_integrations_mercury (company_id, api_key_ciphertext, api_key_last4)
    VALUES ('cust_123', '...ciphertext...', '1234');
    ```

## 4. Usage (Client Side)

Your Vercel app (the client) must sign requests.

**Headers Required:**
*   `X-Relay-Timestamp`: Current timestamp (ms).
*   `X-Relay-Nonce`: Random string (unique per request).
*   `X-Relay-Signature`: HMAC-SHA256 signature.

**Signature Generation (Node.js Example):**

```javascript
const crypto = require('crypto');

const secret = process.env.RELAY_SHARED_SECRET;
const timestamp = Date.now().toString();
const nonce = crypto.randomBytes(8).toString('hex');
const method = 'GET';
const path = '/mercury/request'; // The relay endpoint
const body = JSON.stringify({
  company_id: 'cust_123',
  method: 'GET',
  path: '/v1/account/123'
});

const payload = `${timestamp}.${nonce}.${method}.${path}.${body}`;
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

await fetch('https://mercury-relay.your-domain.com/mercury/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Relay-Timestamp': timestamp,
    'X-Relay-Nonce': nonce,
    'X-Relay-Signature': signature
  },
  body: body
});
```

## 5. Troubleshooting

*   **Signature Failed**: Ensure the Vercel app and Relay share the exact same `RELAY_SHARED_SECRET`. Ensure the body being signed is exactly the string being sent.
*   **Database Error**: Check `DATABASE_URL`. Ensure the table exists.
*   **Mercury Error**: Check if the VPS IP is whitelisted in Mercury. Check if the Mercury API Key is valid.
*   **Path Blocked**: The relay enforces an allowlist in `src/routes/relay.js`. Add paths there if needed.
