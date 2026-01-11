const crypto = require('crypto')
const config = require('../config')

// In-memory nonce cache: nonce -> expiry timestamp (ms)
const nonceCache = new Map()

// Clean up expired nonces every minute
setInterval(() => {
  const now = Date.now()
  // 1. Remove expired
  for (const [nonce, expiry] of nonceCache.entries()) {
    if (now > expiry) {
      nonceCache.delete(nonce)
    }
  }
  // 2. Enforce max entries (simple LRU approximation by just deleting if full? or strictly fail?)
  // If we are under attack, we might fill up. Pruning random/oldest is better than crashing.
  // Map iterates in insertion order. So the first items are the oldest.
  if (nonceCache.size > config.RELAY_NONCE_MAX_ENTRIES) {
    const toRemove = nonceCache.size - config.RELAY_NONCE_MAX_ENTRIES
    let removed = 0
    for (const key of nonceCache.keys()) {
      nonceCache.delete(key)
      removed++
      if (removed >= toRemove) break
    }
  }
}, 60 * 1000).unref()

function verifySignature (req, rawBody) {
  const timestamp = req.headers['x-relay-timestamp']
  const nonce = req.headers['x-relay-nonce']
  const signature = req.headers['x-relay-signature']

  if (!timestamp || !nonce || !signature) {
    throw new Error('Missing authentication headers')
  }

  // 1. Check Timestamp
  const now = Date.now()
  const reqTime = parseInt(timestamp, 10)
  
  if (isNaN(reqTime)) {
    throw new Error('Invalid timestamp')
  }

  if (Math.abs(now - reqTime) > config.TIMESTAMP_WINDOW_MS) {
    throw new Error('Request timestamp outside valid window')
  }

  // 2. Check Nonce (Replay Protection)
  // Key by timestamp + nonce to be extra safe, or just nonce. 
  // Prompt says "in-memory nonce store keyed by <timestamp>.<nonce> (or just nonce + timestamp bucket)".
  // We'll use nonce as key, but strictly checks.
  if (nonceCache.has(nonce)) {
    throw new Error('Nonce already used')
  }
  
  nonceCache.set(nonce, reqTime + (config.RELAY_NONCE_TTL_SECONDS * 1000))

  // 3. Verify HMAC
  const method = req.method.toUpperCase() // 'POST'
  // relayPath should be exactly '/mercury/request' usually.
  // We use the actual path the request came to.
  const path = req.routerPath || req.url.split('?')[0]
  
  const payload = `${timestamp}.${nonce}.${method}.${path}.${rawBody || ''}`
  
  const expectedSignature = crypto
    .createHmac('sha256', config.RELAY_SHARED_SECRET)
    .update(payload)
    .digest('hex')

  // constant-time comparison
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  // Avoid timing attacks and crashes on length mismatch
  if (signatureBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid signature')
  }

  return true
}

module.exports = { verifySignature }
