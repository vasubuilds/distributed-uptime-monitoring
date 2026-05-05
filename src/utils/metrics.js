const client = require('prom-client');

client.collectDefaultMetrics({ prefix: 'healthmon_' });

const checkDuration = new client.Histogram({
  name: 'healthmon_check_duration_seconds',
  help: 'Duration of each health check probe',
  labelNames: ['monitor_id', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
});

const checksTotal = new client.Counter({
  name: 'healthmon_checks_total',
  help: 'Total health checks executed',
  labelNames: ['monitor_id', 'status'],
});

const httpRequestDuration = new client.Histogram({
  name: 'healthmon_http_request_duration_seconds',
  help: 'API request latency',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1],
});

function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode });
  });
  next();
}

async function metricsRoute(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = { checkDuration, checksTotal, metricsMiddleware, metricsRoute };
