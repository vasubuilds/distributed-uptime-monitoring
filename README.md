# API HealthMon — Developer Uptime & Latency Monitor

> Distributed system for monitoring API uptime, latency, and reliability with alerting and observability.

A self-hosted tool for developers to monitor the health and performance of external API dependencies. Register endpoints, configure probing intervals, receive downtime alerts, and analyze uptime and latency reports.

---

## Highlights

* Distributed scheduler using Redis SET NX locking
* Real-time observability with Prometheus + Grafana
* PostgreSQL analytics for P95 latency and uptime reporting
* Threshold-based alerting with email/webhook notifications
* Dockerized deployment with CI/CD pipeline

---

## Use Case

You run a backend that depends on Stripe, Twilio, OpenAI, and internal microservices.

With API HealthMon you can:

* Register endpoints with custom check intervals
* Receive alerts after consecutive failures
* Track uptime %, P95 latency, and incident timelines
* Monitor services with Prometheus + Grafana dashboards

---

## Architecture

Client → API → Scheduler (cron)

│

├── Redis (SET NX distributed lock)

│        ↓

│   Checker Workers

│        ↓

├── PostgreSQL (history + analytics)

│

├── Redis Sorted Sets (24h rolling stats)

│

├── Alert Service → Email/Webhook

│

└── Prometheus → Grafana Dashboard

---

## Key Design Decisions

| Concern            | Choice               | Why                                      |
| ------------------ | -------------------- | ---------------------------------------- |
| Scheduling         | Redis SET NX         | Prevent duplicate checks across replicas |
| Rolling Stats      | Redis Sorted Sets    | Fast time-window analytics               |
| Historical Reports | PostgreSQL           | Accurate uptime and P95 analytics        |
| Alerting           | Redis Counters       | Prevent repeated alert storms            |
| Observability      | Prometheus + Grafana | Real-time monitoring                     |
| Deployment         | Docker + CI/CD       | Production-style deployment              |

---

## Quick Start

```bash
cp .env.example .env
docker compose up -d
node migrations/migrate.js
```

API available at:

```bash
http://localhost:5000
```

---

## API Reference

### Auth

```http
POST /api/auth/register
POST /api/auth/login
```

---

### Monitors

```http
GET    /api/monitors
POST   /api/monitors
GET    /api/monitors/:id
PATCH  /api/monitors/:id
DELETE /api/monitors/:id
GET    /api/monitors/:id/stats
GET    /api/monitors/:id/history
POST   /api/monitors/:id/check-now
```

---

## Observability

```http
GET /health
GET /metrics
```

---

## Performance

* Handles 500+ checks/minute
* Average latency under 100ms
* Supports horizontal scaling using Redis locking
* Optimized PostgreSQL queries using composite indexing

---

## Tech Stack

* Node.js
* Express.js
* Redis
* PostgreSQL
* Prometheus
* Grafana
* Docker
* GitHub Actions


