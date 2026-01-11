async function healthRoutes (fastify, options) {
  fastify.get('/healthz', async (request, reply) => {
    return { status: 'ok' }
  })
}

module.exports = healthRoutes
