const t = require('tap')
const crypto = require('crypto')
const { Readable } = require('stream')

// Mock Env Variables
const sharedSecret = 'test-secret'
const masterKey = crypto.randomBytes(32)
process.env.RELAY_SHARED_SECRET = sharedSecret
process.env.RELAY_ENCRYPTION_KEY_B64 = masterKey.toString('base64')
process.env.LOG_LEVEL = 'silent' // Keep logs quiet during tests

const { encrypt } = require('../src/lib/encryption')

t.test('Relay Route', async t => {
  // Mock undici request
  const mockRequest = async (url, opts) => {
    // We can inspect opts here if needed
    if (opts.headers.Authorization !== 'Bearer sk_test_mercury_key') {
        throw new Error('Wrong Authorization Header')
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Readable.from([JSON.stringify({ success: true, data: 'mocked-response' })])
    }
  }

  // Mock the module
  const relayRoutes = t.mock('../src/routes/relay', {
    'undici': {
      request: mockRequest
    }
  })

  const app = require('fastify')()
  // Register the mocked routes
  app.register(relayRoutes)
  // Register content type parser as in app.js
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
      var json = JSON.parse(body)
      req.rawBody = body
      done(null, json)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  await app.ready()

  const mercuryKey = 'sk_test_mercury_key'
  const encryptedKey = encrypt(mercuryKey)
  
  const payload = {
    company_id: 'test-company',
    encrypted_key: encryptedKey,
    mercury: {
      method: 'GET',
      path: '/api/v1/accounts', // Allowed path
      query: { limit: 10 }
    }
  }
  
  const bodyString = JSON.stringify(payload)
  
  // Generate Signature
  const now = Date.now()
  const nonce = crypto.randomBytes(8).toString('hex')
  // New signature format: ts.nonce.POST.path.body
  const signaturePayload = `${now}.${nonce}.POST./mercury/request.${bodyString}`
  const signature = crypto.createHmac('sha256', sharedSecret).update(signaturePayload).digest('hex')

  const response = await app.inject({
    method: 'POST',
    url: '/mercury/request',
    headers: {
      'x-relay-timestamp': now.toString(),
      'x-relay-nonce': nonce,
      'x-relay-signature': signature,
      'content-type': 'application/json'
    },
    payload: bodyString
  })

  t.equal(response.statusCode, 200, 'Should return 200 OK')

  const resJson = JSON.parse(response.body)
  t.equal(resJson.data, 'mocked-response', 'Should return upstream data')
  
  t.end()
})