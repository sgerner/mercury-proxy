const { decrypt } = require('../lib/encryption')

const ciphertext = process.argv[2]

if (!ciphertext) {
  console.error('Usage: node src/scripts/decrypt-key.js <ciphertext>')
  process.exit(1)
}

try {
  const plaintext = decrypt(ciphertext)
  console.log('Plaintext:', plaintext)
} catch (err) {
  console.error('Decryption failed:', err.message)
  process.exit(1)
}
