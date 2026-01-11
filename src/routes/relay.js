const { request } = require('undici')
const { verifySignature } = require('../lib/security')
const { getMercuryKey } = require('../lib/db')
const { decrypt } = require('../lib/encryption')
const config = require('../config')

// Strict allowlist for Mercury API paths.
// Add paths here as needed. Exact match or basic prefix matching could be implemented.
// Currently implementing exact match for safety.
const ALLOWED_PATHS = new Set([
  // Example: '/v1/account',
  // '/v1/transactions'
])

// Helper to check if path is allowed
function isPathAllowed(path) {
  // If we want to allow everything for testing, we could uncomment this:
  // return true 
  
  if (ALLOWED_PATHS.has(path)) return true
  
  // Optional: Allow prefix matching if needed
  // for (const allowed of ALLOWED_PATHS) {
  //   if (path.startsWith(allowed)) return true
  // }

  return false
}

async function relayRoutes (fastify, options) {
  fastify.post('/mercury/request', {
    // Auth Middleware
    preHandler: async (req, reply) => {
      try {
        // req.rawBody is populated by our custom content type parser in app.js
        verifySignature(req, req.rawBody)
      } catch (err) {
        req.log.warn({ err }, 'Authentication failed')
        reply.code(401).send({ error: 'Authentication failed', message: err.message })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['company_id', 'method', 'path'],
        properties: {
          company_id: { type: 'string' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          path: { type: 'string' },
          query: { type: 'object' },
          body: { type: 'object' },
          idempotency_key: { type: 'string' }
        }
      }
    }
  }, async (req, reply) => {
    const { company_id, method, path, query, body, idempotency_key } = req.body

    // 1. Validate Path
    if (!isPathAllowed(path)) {
      req.log.warn({ path, company_id }, 'Blocked request to disallowed path')
      return reply.code(403).send({ error: 'Path not allowed' })
    }

    // 2. Get Encrypted Key
    try {
      const integration = await getMercuryKey(company_id)
      if (!integration) {
        req.log.warn({ company_id }, 'Company integration not found')
        return reply.code(404).send({ error: 'Integration not found' })
      }

      // 3. Decrypt Key
      const apiKey = decrypt(integration.api_key_ciphertext)
      
      // 4. Make Request to Mercury
      const url = new URL(path, config.MERCURY_API_BASE)
      if (query) {
        Object.keys(query).forEach(key => url.searchParams.append(key, query[key]))
      }

      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mercury-Relay/1.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }

      if (idempotency_key) {
        headers['Idempotency-Key'] = idempotency_key
      }

      // 5. Execute Request
      // We use undici.request
      const upstreamRes = await request(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })

      // 6. Handle Response
      // Consume body
      const resBody = await upstreamRes.body.json().catch(() => ({}))
      
      reply.code(upstreamRes.statusCode).send(resBody)

    } catch (err) {
      req.log.error({ err, company_id }, 'Relay error')
      // Generic error to not leak details
      reply.code(502).send({ error: 'Upstream request failed' })
    }
  })
}

module.exports = relayRoutes
