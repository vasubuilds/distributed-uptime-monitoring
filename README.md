# API HealthMon — Developer Uptime & Latency Monitor

A self-hosted tool for developers to monitor the health and performance of their external API dependencies. Register endpoints, configure probing intervals, receive alerts on downtime, and view uptime reports and incident logs.

## Use Case

You run a backend that depends on Stripe, Twilio, OpenAI, and an internal microservice. With API HealthMon you:
- Register each endpoint with custom check intervals and expected status codes
- Get alerted (email or webhook) after N consecutive failures
- View daily uptime %, P95 latency, and incident timelines
- Scrape Prometheus metrics into Grafana for live dashboards

## Architecture

```
Scheduler (cron, 30s tick)
    │
    ├── Distributed lock via Redis (SET NX) — only one instance checks per interval
    │
    └── CheckerService
          ├── HTTP probe (axios, configurable timeout)
          ├── Persist result → PostgreSQL (check_results)
          ├── Update rolling 24h stats → Redis sorted sets
          ├── AlertService → consecutive failure tracking → Redis counter
          │     └── NotificationService → email / webhook
          └── Prometheus metrics → Grafana dashboard
```

### Key Design Decisions
| Concern | Choice | Why |
|---|---|---|
| Scheduling | node-cron (30s tick) + Redis SET NX | Prevents duplicate checks across replicas without a job queue |
| 24h stats | Redis sorted sets with timestamps as scores | O(log N) insert, fast time-range slicing, auto-TTL |
| Historical reports | PostgreSQL with composite index | Supports 90-day uptime % and P95 queries |
| Alert storms | Redis incr counter — alert fires exactly at threshold | No repeated pages for sustained outage |
| Observability | Prometheus `/metrics` + Grafana dashboard | Real-time visibility without 3rd party APM |
| CI/CD | GitHub Actions → Docker Hub → SSH deploy | Full pipeline from push to production |

## Quick Start

```bash
cp .env.example .env
# Edit .env with your DB/Redis credentials

docker compose up -d
node migrations/migrate.js
```

API is live at `http://localhost:5000`

## API Reference

### Auth
```
POST /api/auth/register   { email, password }
POST /api/auth/login      { email, password }  → { token }
```

### Monitors (Bearer token required)
```
GET    /api/monitors               list your monitors
POST   /api/monitors               create a monitor
GET    /api/monitors/:id           get one
PATCH  /api/monitors/:id           update
DELETE /api/monitors/:id           delete
GET    /api/monitors/:id/stats     24h stats (Redis)
GET    /api/monitors/:id/history   paginated check results
POST   /api/monitors/:id/check-now trigger an immediate probe
```

### Create Monitor Example
```json
POST /api/monitors
{
  "name": "Stripe API",
  "url": "https://api.stripe.com/v1/charges",
  "method": "GET",
  "intervalSec": 60,
  "timeoutMs": 5000,
  "expectedStatus": 401,
  "alertThreshold": 3
}
```
*(401 expected because we're probing without auth — just verifying the endpoint is reachable)*

### Reports
```
GET /api/reports/summary                      all monitors + 24h stats
GET /api/reports/:monitorId/uptime?days=30    daily uptime % + latency
GET /api/reports/:monitorId/incidents         state-change log
```

### Alerts
```
GET   /api/alerts             list all alerts with unread count
PATCH /api/alerts/:id/read    mark as read
```

### Observability
```
GET /health     liveness probe
GET /metrics    Prometheus metrics
```

## Performance Notes
- Redis SET NX lock prevents check duplication; safe to run multiple replicas
- Rolling stats use sorted sets — no aggregation query needed for dashboards
- Historical reports use PostgreSQL `PERCENTILE_CONT` for accurate P95
- `idx_check_results_monitor_time` composite index makes history queries fast even at millions of rows
