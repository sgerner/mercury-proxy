require('dotenv').config()

const requiredEnv = [
  'RELAY_SHARED_SECRET',
  'RELAY_ENCRYPTION_KEY_B64',
  'DATABASE_URL'
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
  DATABASE_URL: process.env.DATABASE_URL,
  MERCURY_API_BASE: 'https://api.mercury.com',
  // Window in milliseconds for request timestamp validity (e.g., 5 minutes)
  TIMESTAMP_WINDOW_MS: 5 * 60 * 1000
}
