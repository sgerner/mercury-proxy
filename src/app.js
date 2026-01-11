const fastify = require('fastify')
const healthRoutes = require('./routes/health')
const relayRoutes = require('./routes/relay')

function build (opts = {}) {
  const app = fastify(opts)

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
