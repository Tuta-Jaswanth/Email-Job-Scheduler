# ReachInbox — Email Scheduler

A production-grade email scheduling system with Google OAuth login, BullMQ-powered queue, Elasticsearch search, Slack notifications, and a real-time BullMQ dashboard.

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│  React Frontend     │────▶│  Express REST API  (port 4000)   │
│  (Vite, port 5173)  │◀────│  + BullMQ Admin  /admin/queues   │
└─────────────────────┘     └──────────┬───────────────────────┘
                                       │
              ┌────────────────────────┼──────────────────────┐
              │                        │                      │
        ┌─────▼─────┐          ┌───────▼──────┐    ┌─────────▼──────────┐
        │ PostgreSQL │          │  Redis 7     │    │ Elasticsearch 8.15 │
        │ (Prisma)  │          │  BullMQ queue│    │ Full-text search   │
        └───────────┘          └──────┬───────┘    └────────────────────┘
                                      │
                               ┌──────▼──────┐
                               │ BullMQ      │
                               │ Worker      │
                               │ concurrency │
                               │ = env var   │
                               └─────────────┘
```

---

## Prerequisites

- **Node.js** ≥ 20
- **Docker & Docker Compose** (for Postgres, Redis, Elasticsearch)
- A **Google OAuth 2.0** web application (see `.env.example`)
- **Ethereal SMTP** credentials (auto-generated at [ethereal.email](https://ethereal.email))

---

## Quick Start

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts Postgres 16, Redis 7, and Elasticsearch 8.15 with health checks.

### 2. Backend Setup

```bash
cd reachinbox-work/backend

# Copy and fill in your secrets
cp .env.example .env
# Edit .env with your Google OAuth credentials, JWT secret, etc.

# Install dependencies
npm install

# Apply database migrations
npm run prisma:migrate

# Start the API + worker (in development mode)
npm run dev
```

The backend starts at **http://localhost:4000**.  
BullMQ admin dashboard: **http://localhost:4000/admin/queues**

### 3. Frontend Setup

```bash
cd reachinbox-work/frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:5173**.

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | API server port | `4000` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | _(required)_ |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `ELASTICSEARCH_URL` | Elasticsearch base URL | `http://localhost:9200` |
| `JWT_SECRET` | Secret for signing session JWTs | _(required)_ |
| `WORKER_CONCURRENCY` | Number of parallel email send jobs | `10` |
| `MIN_DELAY_MS` | Minimum delay between individual sends (ms) | `2000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Global hourly rate limit per sender | `200` |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID | _(required)_ |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret | _(required)_ |
| `GOOGLE_CALLBACK_URL` | OAuth redirect URI | `http://localhost:4000/auth/google/callback` |
| `SLACK_CLIENT_ID` | Slack app client ID | _(optional)_ |
| `SLACK_CLIENT_SECRET` | Slack app client secret | _(optional)_ |
| `SLACK_REDIRECT_URI` | Slack OAuth redirect URI | _(optional)_ |
| `ETHEREAL_USER` | Ethereal SMTP username | _(required)_ |
| `ETHEREAL_PASSWORD` | Ethereal SMTP password | _(required)_ |
| `ETHEREAL_FROM` | From address for outbound emails | _(required)_ |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/auth/google` | Start Google OAuth flow |
| `GET` | `/auth/google/callback` | Google OAuth callback |
| `POST` | `/auth/logout` | Clear session cookie |
| `GET` | `/api/me` | Get current user |

### Emails
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/emails/schedule` | Schedule a new batch |
| `GET` | `/api/emails?status=scheduled` | List scheduled emails (paginated) |
| `GET` | `/api/emails?status=sent` | List sent/failed emails |
| `GET` | `/api/emails/:id` | Get single email by ID |
| `DELETE` | `/api/emails/:id` | Cancel a scheduled email |
| `GET` | `/api/emails/search?q=<query>` | Full-text search via Elasticsearch |

**Schedule Payload:**
```json
{
  "subject": "Hello World",
  "bodyHtml": "<p>Hi there!</p>",
  "recipients": ["alice@example.com", "bob@example.com"],
  "startTime": "2024-12-01T09:00:00.000Z",
  "delayBetweenEmails": 2000,
  "hourlyLimit": 100,
  "senderId": "uuid-optional"
}
```

### Senders
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/senders` | List available SMTP senders |

### Slack
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/slack/connect` | Start Slack OAuth |
| `GET` | `/api/slack/callback` | Slack OAuth callback |
| `DELETE` | `/api/slack/disconnect` | Unlink Slack |

---

## Key Design Decisions

### Scheduling — No Cron
Jobs are scheduled using **BullMQ delayed jobs** (`delay: scheduledAt - now`). If the server restarts, Redis persists the queue and jobs fire at the correct time. No cron expression is used anywhere.

### Idempotency
- Each email gets a deterministic BullMQ `jobId` (`email:<uuid>`). Re-adding the same job ID is a no-op.
- Workers check `email.status === 'SENT' | 'FAILED'` before processing.

### Rate Limiting
Redis `INCR` with a per-sender, per-hour key provides atomic rate limiting safe for concurrent workers. When the limit is hit:
1. A Slack notification is sent to the user.
2. The job is re-delayed to the start of the next hour window.

### Concurrency
`WORKER_CONCURRENCY` sets the number of parallel BullMQ worker slots. All slots share the same Redis rate limiter, so the limit is respected across all workers.

### Per-Job Retry Strategy
Jobs are configured with `attempts: 5` and `backoff: { type: 'exponential', delay: 30_000 }` — delays of 30 s, 1 min, 2 min, 4 min, 8 min.

### SMTP Transporter Pool
One `nodemailer` transporter (with connection pooling) is kept alive per sender. This avoids the overhead of opening a new TCP connection for every email.

### Elasticsearch Security
Search results are filtered by `userId` in the ES query, not just in application code. Each indexed document includes the `userId` field.

### Graceful Shutdown
On `SIGTERM` / `SIGINT`:
1. HTTP server stops accepting new connections.
2. BullMQ worker drains in-flight jobs (up to 30 s).
3. Prisma and Redis connections are closed cleanly.

---

## Cloud Deployment Guide

### 1. Backend Deployment to Render

1. **Create a PostgreSQL Database on Render**:
   - In your Render Dashboard, click **New +** → **PostgreSQL**.
   - Copy the **Internal Database URL** (or **External Database URL**).

2. **Create a Redis Instance on Render**:
   - Click **New +** → **Redis**.
   - Copy the **Internal / External Redis Connection URL** (`rediss://...`).

3. **Create the Backend Web Service**:
   - Click **New +** → **Web Service** → Connect your GitHub repository.
   - **Root Directory**: `reachinbox-work/backend` (or `backend`)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm run start`
   - **Health Check Path**: `/health`

4. **Set Environment Variables on Render**:
   | Variable | Value | Note |
   |---|---|---|
   | `NODE_ENV` | `production` | Enables cross-domain cookies & TLS |
   | `PORT` | `10000` | Render standard port |
   | `DATABASE_URL` | `postgresql://...` | From step 1 |
   | `REDIS_URL` | `rediss://...` | From step 2 |
   | `JWT_SECRET` | `32+ char random string` | Generate random secret |
   | `FRONTEND_URL` | `https://your-frontend.vercel.app` | Your Vercel frontend URL |
   | `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | From Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | From Google Cloud Console |
   | `GOOGLE_CALLBACK_URL` | `https://your-backend.onrender.com/auth/google/callback` | Callback URL |
   | `WORKER_CONCURRENCY` | `10` | Concurrency worker slots |
   | `MIN_DELAY_MS` | `2000` | Rate spacing |
   | `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Hourly rate limit |

---

### 2. Frontend Deployment to Vercel

1. **Import Project to Vercel**:
   - In your Vercel Dashboard, click **Add New...** → **Project** → Select your repository.
   - **Framework Preset**: `Vite`
   - **Root Directory**: `reachinbox-work/frontend` (or `frontend`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

2. **Set Environment Variables on Vercel**:
   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-backend.onrender.com` (Your Render API URL) |

3. **Deploy**:
   - Click **Deploy**. Vercel will automatically build and serve the app with SPA rewrites handled by `vercel.json`.

---

### 3. Google Cloud OAuth Configuration

In your [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
1. Under **Authorized JavaScript Origins**, add:
   - `https://your-frontend.vercel.app`
   - `https://your-backend.onrender.com`
   - `http://localhost:5173` (for local dev)
2. Under **Authorized Redirect URIs**, add:
   - `https://your-backend.onrender.com/auth/google/callback`
   - `http://localhost:4000/auth/google/callback` (for local dev)

---

## Project Structure

```
reachinbox-work/
├── backend/
│   ├── prisma/schema.prisma        # DB schema
│   ├── src/
│   │   ├── config/                 # env, db, redis
│   │   ├── controllers/            # HTTP handlers
│   │   ├── middleware/             # JWT auth
│   │   ├── queues/                 # BullMQ queue + Bull Board
│   │   ├── routes/                 # Express routers
│   │   ├── services/               # mail, rate, search, slack
│   │   ├── utils/logger.ts         # Structured JSON logger
│   │   ├── workers/email.worker.ts # BullMQ worker
│   │   └── server.ts               # App entry point
│   ├── render.yaml                 # Render Blueprint specification
│   ├── Dockerfile                  # Production container build
│   └── .env.production.example
├── frontend/
│   ├── vercel.json                 # Vercel SPA routing & security headers
│   ├── src/
│   │   ├── components/             # auth, compose, dashboard, detail, layout
│   │   ├── context/                # AuthContext, ToastContext
│   │   ├── lib/api.ts              # Axios client (dynamic API base URL)
│   │   ├── pages/Dashboard.tsx
│   │   └── types/index.ts
│   └── .env.example
└── docker-compose.yml
```
