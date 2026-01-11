const t = require('tap')
const crypto = require('crypto')

// Mock Env
process.env.RELAY_ENCRYPTION_KEY_B64 = crypto.randomBytes(32).toString('base64')
process.env.DATABASE_URL = 'postgres://mock:mock@localhost:5432/mock'
process.env.RELAY_SHARED_SECRET = 'mock-secret'

const { encrypt, decrypt } = require('../src/lib/encryption')

t.test('Encryption', t => {
  const original = 'sk_test_123456789'
  
  const encrypted = encrypt(original)
  t.not(encrypted, original, 'Ciphertext should differ from plaintext')
  
  const decrypted = decrypt(encrypted)
  t.equal(decrypted, original, 'Decrypted text should match original')
  
  t.end()
})

t.teardown(() => {
  delete process.env.RELAY_ENCRYPTION_KEY_B64
  delete process.env.DATABASE_URL
})
