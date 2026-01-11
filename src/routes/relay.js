const { request } = require('undici')
const { verifySignature } = require('../lib/security')
const { decrypt } = require('../lib/encryption')
const { isRateLimited } = require('../lib/ratelimit')
const config = require('../config')

// Strict Allowlist
// We use regex to match paths safely.
const ALLOWLIST = [
  { method: 'GET', pattern: /^\/api\/v1\/accounts\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/transactions\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/account\/[^/]+\/transaction\/[^/]+\/?$/ },
  { method: 'PATCH', pattern: /^\/api\/v1\/transaction\/[^/]+\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/recipients\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/recipient\/[^/]+\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/recipients\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/recipient\/[^/]+\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/account\/[^/]+\/statements\/?$/ },
  { method: 'GET', pattern: /^\/api\/v1\/statements\/[^/]+\/pdf\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/account\/[^/]+\/request-send-money\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/account\/[^/]+\/transactions\/?$/ },
  // Webhooks (optional but requested)
  { method: 'GET', pattern: /^\/api\/v1\/webhooks\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/webhooks\/?$/ }
]

function isPathAllowed(method, path) {
  if (config.RELAY_ALLOW_ALL_PATHS) return true
  
  // Normalize method
  const upperMethod = method.toUpperCase()
  
  for (const rule of ALLOWLIST) {
    if (rule.method === upperMethod && rule.pattern.test(path)) {
      return true
    }
  }
  
  return false
}

async function relayRoutes (fastify, options) {
  fastify.post('/mercury/request', {
    // Increase body limit for this route if needed, though app-level limit applies.
    // We already set global limit.
    
    // Auth Middleware
    preHandler: async (req, reply) => {
      try {
        verifySignature(req, req.rawBody)
      } catch (err) {
        // Log generic error, do not log details if sensitive (verifySignature throws safe errors)
        req.log.warn({ err: err.message }, 'Authentication failed')
        reply.code(401).send({ error: 'Authentication failed', message: err.message })
      }
    }
  }, async (req, reply) => {
    const start = Date.now()
    let companyId = null
    let connectionId = null
    let upstreamMethod = null
    let upstreamPath = null
    
    try {
      const payload = req.body
      
      // 1. Parse Payload (Legacy vs New)
      let encryptedKey = payload.encrypted_key
      
      if (payload.mercury) {
        // New Shape
        companyId = payload.company_id
        connectionId = payload.connection_id
        upstreamMethod = payload.mercury.method
        upstreamPath = payload.mercury.path
        var upstreamQuery = payload.mercury.query
        var upstreamBody = payload.mercury.body
      } else {
        // Legacy Shape
        companyId = payload.company_id // Optional in legacy
        upstreamMethod = payload.method
        upstreamPath = payload.path
        var upstreamQuery = payload.query
        var upstreamBody = payload.body
      }
      
      if (!encryptedKey || !upstreamMethod || !upstreamPath) {
        return reply.code(400).send({ error: 'Missing required fields' })
      }

      // 2. Rate Limiting
      // Use companyId if available, else fallback to IP (req.ip)
      const rlKey = companyId || req.ip
      if (isRateLimited(rlKey)) {
        req.log.warn({ companyId, ip: req.ip }, 'Rate limit exceeded')
        return reply.code(429).header('Retry-After', config.RELAY_RL_WINDOW_SECONDS).send({ error: 'Too Many Requests' })
      }

      // 3. Allowlist Check
      if (!isPathAllowed(upstreamMethod, upstreamPath)) {
        req.log.warn({ companyId, upstreamMethod, upstreamPath }, 'Blocked request to disallowed path')
        return reply.code(403).send({ error: 'Path not allowed' })
      }

      // 4. Decrypt Key
      const apiKey = decrypt(encryptedKey)
      
      // Calculate key fingerprint (last 8 of sha256 of encrypted key) for logging
      // const keyFingerprint = crypto.createHash('sha256').update(encryptedKey).digest('hex').slice(-8)
      // Actually let's just use the fact we have company_id or request_id for correlation.

      // 5. Construct Upstream URL
      const url = new URL(upstreamPath, config.MERCURY_API_BASE)
      if (upstreamQuery) {
        Object.keys(upstreamQuery).forEach(key => url.searchParams.append(key, upstreamQuery[key]))
      }

      // 6. Upstream Request
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mercury-Relay/1.0',
        'Accept': 'application/json'
      }
      
      // Forward Content-Type if we have a body
      if (upstreamBody) {
        headers['Content-Type'] = 'application/json'
      }

      // Use undici.request which returns a streamable body
      // We set a strict timeout for response headers
      const { statusCode, headers: resHeaders, body: resBody } = await request(url.toString(), {
        method: upstreamMethod,
        headers,
        body: upstreamBody ? JSON.stringify(upstreamBody) : undefined,
        headersTimeout: config.RELAY_CONNECT_TIMEOUT_MS,
        bodyTimeout: config.RELAY_RESPONSE_TIMEOUT_MS
      })

      // 7. Check Response Size (Guard)
      // We can't easily check total size of stream before consuming, but we can abort if it gets too large.
      // Fastify doesn't have a built-in max response size for streams, but we can wrap it?
      // Or just trust Undici's bodyTimeout to handle slow huge downloads.
      // For size, we can check Content-Length header if present.
      const contentLength = resHeaders['content-length']
      if (contentLength && parseInt(contentLength) > config.RELAY_MAX_RESPONSE_BYTES) {
        req.log.warn({ contentLength }, 'Response too large')
        return reply.code(502).send({ error: 'Upstream response too large' })
      }

      // 8. Log Success (Structured)
      const duration = Date.now() - start
      req.log.info({
        request_id: req.id,
        company_id: companyId,
        connection_id: connectionId,
        mercury_method: upstreamMethod,
        mercury_path: upstreamPath,
        status_code: statusCode,
        duration_ms: duration
      }, 'Request relayed')

      // 9. Send Response
      // Forward relevant headers
      const forwardHeaders = ['content-type', 'content-disposition']
      forwardHeaders.forEach(h => {
        if (resHeaders[h]) reply.header(h, resHeaders[h])
      })
      
      // Add Request ID
      reply.header('x-relay-request-id', req.id)

      return reply.code(statusCode).send(resBody)

    } catch (err) {
      req.log.error({ err, companyId }, 'Relay error')
      // Do not leak details
      reply.code(502).send({ error: 'Upstream request failed' })
    }
  })
}

module.exports = relayRoutes
