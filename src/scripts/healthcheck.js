const http = require('http')
const config = require('../config')

const options = {
  host: 'localhost',
  port: config.PORT || 80,
  path: '/healthz',
  timeout: 2000
}

const request = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`)
  if (res.statusCode === 200) {
    process.exit(0)
  } else {
    process.exit(1)
  }
})

request.on('error', function (err) {
  console.error('HEALTHCHECK ERROR:', err.message)
  process.exit(1)
})

request.end()
