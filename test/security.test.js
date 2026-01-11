const t = require('tap')
const crypto = require('crypto')

// Mock Env
process.env.RELAY_SHARED_SECRET = 'secret-123'
process.env.RELAY_ENCRYPTION_KEY_B64 = crypto.randomBytes(32).toString('base64')
process.env.DATABASE_URL = 'postgres://mock'

const { verifySignature } = require('../src/lib/security')

t.test('Security - verifySignature', t => {
  const secret = process.env.RELAY_SHARED_SECRET
  const method = 'POST'
  const path = '/mercury/request'
  const body = JSON.stringify({ foo: 'bar' })
  const now = Date.now()
  const nonce = crypto.randomBytes(8).toString('hex')

  const payload = `${now}.${nonce}.${method}.${path}.${body}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  const req = {
    headers: {
      'x-relay-timestamp': now.toString(),
      'x-relay-nonce': nonce,
      'x-relay-signature': signature
    },
    method,
    url: path
  }

  t.doesNotThrow(() => verifySignature(req, body), 'Valid signature should pass')

  // Replay
  t.throws(() => verifySignature(req, body), /Nonce already used/, 'Replay should fail')

  // Bad Signature
  const badReq = { ...req, headers: { ...req.headers, 'x-relay-nonce': 'newnonce', 'x-relay-signature': 'bad' } }
  t.throws(() => verifySignature(badReq, body), /Invalid signature/, 'Bad signature should fail')

  // Old Timestamp
  const oldTime = now - (6 * 60 * 1000) // 6 mins ago
  const oldNonce = 'oldnonce'
  const oldPayload = `${oldTime}.${oldNonce}.${method}.${path}.${body}`
  const oldSig = crypto.createHmac('sha256', secret).update(oldPayload).digest('hex')
  
  const oldReq = {
    headers: {
      'x-relay-timestamp': oldTime.toString(),
      'x-relay-nonce': oldNonce,
      'x-relay-signature': oldSig
    },
    method,
    url: path
  }
  
  t.throws(() => verifySignature(oldReq, body), /Request timestamp outside valid window/, 'Old timestamp should fail')

  t.end()
})
