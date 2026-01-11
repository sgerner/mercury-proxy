const build = require('./app')
const config = require('./config')

const app = build({
  logger: {
    level: config.LOG_LEVEL,
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty'
    } : undefined,
    serializers: {
      req (req) {
        return {
          method: req.method,
          url: req.url,
          remoteAddress: req.ip,
          traceId: req.id
        }
      }
    },
    redact: ['req.headers.authorization', 'req.headers["x-relay-signature"]']
  }
})

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: config.HOST })
    app.log.info(`Server listening on ${app.server.address().port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
