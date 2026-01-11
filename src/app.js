const fastify = require('fastify')
const crypto = require('crypto')
const config = require('./config')
const healthRoutes = require('./routes/health')
const relayRoutes = require('./routes/relay')

function build (opts = {}) {
  // Merge opts with our defaults
  const app = fastify({
    ...opts,
    bodyLimit: config.RELAY_MAX_BODY_BYTES,
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-relay-request-id'
  })

  // Custom Content Type Parser to keep raw body for HMAC verification
  app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    try {
      var json = JSON.parse(body)
      req.rawBody = body // Attach raw body string to request
      done(null, json)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  app.register(healthRoutes)
  app.register(relayRoutes)

  return app
}

module.exports = build
