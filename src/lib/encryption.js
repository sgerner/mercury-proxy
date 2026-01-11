const crypto = require('crypto')
const config = require('../config')

const ALGORITHM = 'aes-256-gcm'

// Ensure key is correct length (32 bytes for AES-256)
const getMasterKey = () => {
  const keyBuffer = Buffer.from(config.RELAY_ENCRYPTION_KEY_B64, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('RELAY_ENCRYPTION_KEY_B64 must be a base64 encoded 32-byte key')
  }
  return keyBuffer
}

function encrypt (text) {
  const iv = crypto.randomBytes(16)
  const key = getMasterKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag().toString('base64')

  const payload = {
    iv: iv.toString('base64'),
    authTag: authTag,
    data: encrypted
  }

  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

function decrypt (encryptedPayload) {
  try {
    const jsonString = Buffer.from(encryptedPayload, 'base64').toString('utf8')
    const payload = JSON.parse(jsonString)
    
    const iv = Buffer.from(payload.iv, 'base64')
    const authTag = Buffer.from(payload.authTag, 'base64')
    const key = getMasterKey()

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(payload.data, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (err) {
    // Return null or throw error depending on how we want to handle it.
    // Throwing is safer so the caller knows decryption failed (bad key or tampering).
    throw new Error('Decryption failed: ' + err.message)
  }
}

module.exports = { encrypt, decrypt }
