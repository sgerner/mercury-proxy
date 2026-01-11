const config = require('../config')

// Map<key, { count: number, expiry: number }>
const hits = new Map()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, data] of hits.entries()) {
    if (now > data.expiry) {
      hits.delete(key)
    }
  }
}, 60 * 1000).unref()

/**
 * Check if request is allowed.
 * @param {string} key - Identifier (company_id or ip)
 * @returns {boolean} true if allowed, false if limited
 */
function isRateLimited(key) {
  const now = Date.now()
  const windowMs = config.RELAY_RL_WINDOW_SECONDS * 1000
  const limit = config.RELAY_RL_MAX_REQUESTS

  let record = hits.get(key)

  if (!record || now > record.expiry) {
    // New window
    record = {
      count: 1,
      expiry: now + windowMs
    }
    hits.set(key, record)
    return false
  }

  if (record.count >= limit) {
    return true
  }

  record.count++
  return false
}

module.exports = { isRateLimited }
