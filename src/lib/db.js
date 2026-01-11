const { Pool } = require('pg')
const config = require('../config')

const pool = new Pool({
  connectionString: config.DATABASE_URL
})

async function getMercuryKey (companyId) {
  const query = `
    SELECT api_key_ciphertext, api_key_last4
    FROM company_integrations_mercury
    WHERE company_id = $1 AND is_active = true
  `
  
  const res = await pool.query(query, [companyId])
  
  if (res.rows.length === 0) {
    return null
  }
  
  return res.rows[0]
}

// Function to store key (mostly for CLI/setup, maybe not used by relay directly but good to have)
async function storeMercuryKey (companyId, ciphertext, last4) {
  const query = `
    INSERT INTO company_integrations_mercury 
    (company_id, api_key_ciphertext, api_key_last4, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, true, NOW(), NOW())
    ON CONFLICT (company_id) DO UPDATE SET
    api_key_ciphertext = EXCLUDED.api_key_ciphertext,
    api_key_last4 = EXCLUDED.api_key_last4,
    updated_at = NOW(),
    is_active = true
  `
  await pool.query(query, [companyId, ciphertext, last4])
}

module.exports = {
  pool,
  getMercuryKey,
  storeMercuryKey
}
