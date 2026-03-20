# Docker 3-Tier Application

A containerised web application built for the FiftyFive Technologies DevOps Intern assessment. Three services — Nginx, Node.js, and MySQL — run in isolated containers and communicate over a private Docker network.

---

## Stack

| Layer    | Technology       | Port |
|----------|------------------|------|
| Frontend | Nginx 1.25 Alpine | 80  |
| Backend  | Node.js 20 Alpine | 3000 |
| Database | MySQL 8.0         | 3306 |

---

## Architecture

```
Browser
   │
   │  HTTP :80
   ▼
┌─────────────────────┐
│   Nginx (frontend)  │  serves static HTML
│   nginx:1.25-alpine │  reverse proxies /api/* → backend
└──────────┬──────────┘
           │  http://backend:3000
           ▼
┌─────────────────────┐
│  Node.js (backend)  │  GET /       → status response
│  node:20-alpine     │  GET /health → DB health JSON
└──────────┬──────────┘
           │  mysql2 connection pool
           ▼
┌─────────────────────┐
│   MySQL (db)        │  named volume: mysql-data
│   mysql:8.0         │  persists data across restarts
└─────────────────────┘

All three containers share a custom bridge network: app-network
Services talk to each other by name — no hardcoded IPs anywhere.
```

---

## Getting Started

### Requirements
- Docker Desktop (v24+)
- Docker Compose plugin (`docker compose`, not `docker-compose`)

### Setup

```bash
git clone https://github.com/rajgangwani/Docker-3tier-app.git
cd docker-3tier-assignment

cp .env.example .env
# open .env and set your preferred passwords

docker compose up --build
```

Open http://localhost in your browser.

That's it. One command starts everything in the right order.

---

## How It Works

### Backend startup — waiting for MySQL

`depends_on` with a healthcheck condition is not enough on its own — the container being "healthy" doesn't mean the MySQL socket is immediately ready for queries. Two layers handle this:

**Layer 1 — healthcheck-based depends_on** in `docker-compose.yml`:
```yaml
depends_on:
  db:
    condition: service_healthy
```
Docker holds the backend container until MySQL passes `mysqladmin ping`.

**Layer 2 — `wait-for-db.sh`** inside the backend container:
```sh
while ! nc -z "${HOST}" "${PORT}"; do sleep 2; done
exec node app.js
```
Uses netcat to poll the TCP port every 2 seconds before handing off to Node. Even if the healthcheck fires slightly early, this script catches it.

**Layer 3 — self-healing connection pool** in `app.js`:
The `mysql2` pool resets itself on any connection error, so if MySQL goes away mid-session, the backend reconnects automatically on the next request without restarting.

---

### Dynamic Nginx config — no hardcoded URLs

`nginx.conf` is never written by hand. Instead there's a template:

```nginx
# nginx.conf.template
location /api/ {
    proxy_pass ${BACKEND_URL}/;
}
```

When the container starts, the entrypoint runs:
```sh
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf
```

`BACKEND_URL=http://backend:3000` is injected from the `.env` file via Docker Compose. Change the backend service name or port in `.env` and Nginx picks it up automatically on next start.

---

### Service communication

All containers are on a custom bridge network called `app-network`. Docker's internal DNS resolves container names automatically:

- Frontend → Backend: `http://backend:3000`
- Backend → Database: `db:3306`

No container exposes unnecessary ports to the host. Only the frontend maps `:80` externally.

---

## Testing

```bash
# Is the frontend up?
curl -s -o /dev/null -w "%{http_code}" http://localhost
# 200

# API root via Nginx proxy
curl -s http://localhost/api/
# {"status":"ok","service":"backend-api","timestamp":"..."}

# Health check — confirms DB connection
curl -s http://localhost/api/health
# {"status":"ok","database":"ok","timestamp":"..."}

# All containers and their health
docker compose ps

# Live log stream
docker compose logs -f

# One service only
docker compose logs -f backend
```

---

## Failure Scenario — MySQL Restart

```bash
docker restart app-db
```

### What happens step by step

| Time    | What's happening |
|---------|-----------------|
| 0s      | MySQL shuts down. Backend loses its DB connection. |
| 0–5s    | `GET /health` returns `503 {"status":"degraded","database":"error"}` |
| 5–30s   | MySQL restarts, runs InnoDB recovery, starts accepting connections |
| ~35s    | Backend's next request creates a fresh connection pool, reconnects |
| ~35s    | `GET /health` returns `200 {"status":"ok","database":"ok"}` |

### How to observe it live

Terminal 1 — continuous health watch:
```bash
while true; do curl -s http://localhost/api/health; echo ""; sleep 2; done
```

Terminal 2 — restart MySQL:
```bash
docker restart app-db
```

Watch Terminal 1 cycle through `degraded` and back to `ok` in about 30–40 seconds. The backend never crashes — it just reports the degraded state and recovers automatically.

---

## Bonus Features

**Multi-stage builds** — both Dockerfiles use a builder stage to keep final images lean. The backend deps stage installs npm packages separately, so production images don't carry build tools.

**Non-root user** — the backend runs as `appuser` (a dedicated system user created in the Dockerfile). This limits what a compromised process could do inside the container.

---

## Project Structure

```
.
├── frontend/
│   ├── Dockerfile            # multi-stage nginx build
│   ├── nginx.conf.template   # BACKEND_URL injected at runtime
│   ├── .dockerignore
│   └── index.html
├── backend/
│   ├── Dockerfile            # multi-stage node build, non-root user
│   ├── app.js                # HTTP server — GET / and GET /health
│   ├── package.json
│   ├── wait-for-db.sh        # TCP-level MySQL readiness check
│   └── .dockerignore
├── docker-compose.yml
├── .env.example              # safe to commit — placeholder values only
├── .env                      # never committed — real secrets
├── .gitignore
└── README.md
```

---

## Common Commands

```bash
# Start everything (builds if needed)
docker compose up --build

# Stop, keep data volume
docker compose down

# Stop and wipe database
docker compose down -v

# Check container health
docker compose ps

# Rebuild one service
docker compose build --no-cache backend
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values before running.

```
MYSQL_ROOT_PASSWORD=   # MySQL root password
MYSQL_DATABASE=        # database name
MYSQL_USER=            # app database user
MYSQL_PASSWORD=        # app user password
FRONTEND_PORT=80       # host port for the web UI
```

The `.env` file is in `.gitignore` and should never be committed. Only `.env.example` (with placeholder values) goes into version control.
