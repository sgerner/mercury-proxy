require('dotenv').config()

const requiredEnv = [
  'RELAY_SHARED_SECRET',
  'RELAY_ENCRYPTION_KEY_B64'
]

for (const env of requiredEnv) {
  if (!process.env[env]) {
    console.error(`Missing required environment variable: ${env}`)
    process.exit(1)
  }
}

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  RELAY_SHARED_SECRET: process.env.RELAY_SHARED_SECRET,
  RELAY_ENCRYPTION_KEY_B64: process.env.RELAY_ENCRYPTION_KEY_B64,
  MERCURY_API_BASE: process.env.MERCURY_API_BASE || 'https://api.mercury.com',
  
  // Limits & Timeouts
  RELAY_MAX_BODY_BYTES: parseInt(process.env.RELAY_MAX_BODY_BYTES || (256 * 1024)), // 256KB
  RELAY_MAX_RESPONSE_BYTES: parseInt(process.env.RELAY_MAX_RESPONSE_BYTES || (30 * 1024 * 1024)), // 30MB
  RELAY_CONNECT_TIMEOUT_MS: parseInt(process.env.RELAY_CONNECT_TIMEOUT_MS || 5000),
  RELAY_RESPONSE_TIMEOUT_MS: parseInt(process.env.RELAY_RESPONSE_TIMEOUT_MS || 60000), // 60s for PDF
  
  // Security
  TIMESTAMP_WINDOW_MS: parseInt(process.env.RELAY_MAX_SKEW_SECONDS || 300) * 1000, // 5 min
  RELAY_NONCE_TTL_SECONDS: parseInt(process.env.RELAY_NONCE_TTL_SECONDS || 600),
  RELAY_NONCE_MAX_ENTRIES: parseInt(process.env.RELAY_NONCE_MAX_ENTRIES || 50000),
  RELAY_ALLOW_ALL_PATHS: process.env.RELAY_ALLOW_ALL_PATHS === 'true',
  
  // Rate Limiting
  RELAY_RL_WINDOW_SECONDS: parseInt(process.env.RELAY_RL_WINDOW_SECONDS || 60),
  RELAY_RL_MAX_REQUESTS: parseInt(process.env.RELAY_RL_MAX_REQUESTS || 120)
}
