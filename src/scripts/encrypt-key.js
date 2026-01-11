const { encrypt } = require('../lib/encryption')

const apiKey = process.argv[2]

if (!apiKey) {
  console.error('Usage: node src/scripts/encrypt-key.js <mercury-api-key>')
  process.exit(1)
}

try {
  const ciphertext = encrypt(apiKey)
  const last4 = apiKey.slice(-4)
  
  console.log(JSON.stringify({
    ciphertext,
    last4
  }, null, 2))
} catch (err) {
  console.error('Encryption failed:', err.message)
  process.exit(1)
}
