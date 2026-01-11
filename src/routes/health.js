async function healthRoutes (fastify, options) {
  fastify.get('/healthz', async (request, reply) => {
    return { ok: true }
  })

  fastify.get('/readyz', async (request, reply) => {
    // Check critical env vars
    const required = ['RELAY_SHARED_SECRET', 'RELAY_ENCRYPTION_KEY_B64']
    const missing = required.filter(k => !process.env[k])
    
    if (missing.length > 0) {
      reply.code(503)
      return { ready: false, missing }
    }
    
    return { ready: true }
  })
}

module.exports = healthRoutes
