const crypto = require('crypto')
const config = require('../config')

// In-memory nonce cache: nonce -> expiry timestamp (ms)
const nonceCache = new Map()

// Clean up expired nonces every minute
setInterval(() => {
  const now = Date.now()
  for (const [nonce, expiry] of nonceCache.entries()) {
    if (now > expiry) {
      nonceCache.delete(nonce)
    }
  }
}, 60 * 1000).unref() // unref so it doesn't keep process alive during tests if imported

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
  if (nonceCache.has(nonce)) {
    throw new Error('Nonce already used')
  }
  // Store nonce with expiry = reqTime + window + slop
  // We only need to store it until it would be rejected by timestamp check anyway.
  // Actually, strictly speaking, we reject if |now - reqTime| > window.
  // So a replay is possible if we don't remember nonces from (now - window) to (now + window).
  // We'll set expiry to now + window (or reqTime + window if we trust it, but sticking to local time is safer for cleanup).
  // Let's expire it after 2 * window to be safe.
  nonceCache.set(nonce, now + config.TIMESTAMP_WINDOW_MS)

  // 3. Verify HMAC
  const method = req.method.toUpperCase()
  // path should probably include query string if present?
  // Prompt says "path". Usually this implies path + query if signed, but "path" usually means pathname.
  // Let's assume just pathname for now, or req.url (which includes query).
  // Vercel apps should likely sign `url.pathname` or `url.search`? 
  // Let's use `req.url` which is standard for Node.js http (path + query).
  const path = req.url 
  
  const payload = `${timestamp}.${nonce}.${method}.${path}.${rawBody || ''}`
  
  const expectedSignature = crypto
    .createHmac('sha256', config.RELAY_SHARED_SECRET)
    .update(payload)
    .digest('hex')

  // constant-time comparison
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (signatureBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid signature')
  }

  return true
}

module.exports = { verifySignature }
