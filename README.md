# Timesheet AI

An **AI-powered timesheet generation platform** that automatically ingests developer activity from Git repositories, Discord channels, and Plane issue trackers, then uses AI to produce structured work units and daily summaries suitable for timesheet reporting.

## Overview

Timesheet AI eliminates manual timesheet entry by collecting activity events from the tools your team already uses, normalizing them into a unified format, and leveraging AI agents to generate meaningful work descriptions with time estimates. The system follows a multi-stage processing pipeline:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Ingestion  │────▶│    Event     │────▶│   Session    │────▶│  Work Unit   │────▶│    Daily     │
│  (Git/Plane/ │     │  Enrichment  │     │  Detection   │     │  Generation  │     │   Summary    │
│   Discord)   │     │  + Identity  │     │  + Clustering│     │   (AI Agent) │     │  (AI Agent)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **Ingestion** — Plugins connect to external sources (Git repos via `git clone`/`fetch`, Plane via REST API, Discord via REST API / Gateway WebSocket) and normalize raw events into a common schema.
2. **Event Enrichment** — Resolves external identities (Git author email, Discord username, Plane user) to canonical users within your organization and attributes events to projects via source mappings.
3. **Session Detection & Clustering** — Groups enriched events by user into time-bounded activity sessions, then clusters sessions by topic/project.
4. **Work Unit Generation** — An AI agent (powered by [Mastra](https://mastra.ai/) + Vercel AI SDK) analyzes each cluster and produces a structured work unit with title, summary, time estimate, and confidence score.
5. **Daily Summary Generation** — A second AI agent synthesizes all work units for a user or project into a coherent daily summary suitable for timesheet reporting.

### Architecture

The project is a **monorepo** managed by [Bun workspaces](https://bun.sh/docs/install/workspaces) with three applications and fifteen shared packages:

```
timesheet-ai/
├── apps/
│   ├── server/              # Elysia API server (port 3000)
│   ├── web/                 # TanStack Start frontend (port 3001)
│   └── worker/              # Background job runner (Effect-TS)
├── packages/
│   ├── ai/                  # AI agents (work unit + daily summary)
│   ├── attribution/         # Work attribution logic
│   ├── config/              # Shared TypeScript config (tsconfig.base.json)
│   ├── db/                  # SurrealDB wrapper + migrations + repositories
│   ├── domain/              # Domain models, types, and schemas
│   ├── env/                 # Environment variable schemas (Zod)
│   ├── identity/            # User identity resolution / matching
│   ├── ingestion-core/      # Plugin registration + ingestion pipeline
│   ├── ingestion-discord/   # Discord event ingestion plugin
│   ├── ingestion-git/       # Git log ingestion plugin
│   ├── ingestion-plane/     # Plane issue ingestion plugin
│   ├── observability/       # Logging and metrics
│   ├── sessionization/      # Session + cluster detection algorithms
│   ├── shared/              # Shared utilities
│   └── ui/                  # shadcn/ui component library (Tailwind)
├── infra/
│   └── docker/              # Docker Compose for SurrealDB
└── docs/                    # Plans and specifications
```

**Tech Stack:**
- **Runtime:** [Bun](https://bun.sh/) v1.3.13
- **Frontend:** React 19, TanStack Start (SSR), TanStack Router, TanStack Query, TailwindCSS v4, shadcn/ui
- **API Server:** [Elysia](https://elysiajs.com/) (type-safe, high-performance)
- **Database:** [SurrealDB](https://surrealdb.com/) v2 (multi-model, runs in Docker)
- **Worker:** [Effect-TS](https://effect.website/) for async operations and dependency injection
- **AI:** [Mastra Core](https://mastra.ai/) + Vercel AI SDK for structured output generation
- **Linting/Formatting:** Biome via [Ultracite](https://ultracite.dev/)
- **Type Checking:** Strict TypeScript with `noUncheckedIndexedAccess`

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.3.13 (managed via `mise.toml` or install directly)
- [Docker](https://www.docker.com/) (for SurrealDB)
- [Git](https://git-scm.com/) (for the Git ingestion plugin)

### 1. Install Dependencies

```bash
bun install
```

### 2. Start SurrealDB

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts SurrealDB v2 on port **8000** with:
- **User:** `root`
- **Password:** `root`
- **Namespace:** `timesheet`
- **Database:** `production`

### 3. Run Database Migrations

```bash
bun run db:migrate
```

This creates all required tables (organization, project, canonical_user, external_identity, integration_connection, source_mapping, raw_event_payload, normalized_event, activity_session, activity_cluster, work_unit, daily_summary, job_run, audit_log, review_decision, recompute_request) and indexes.

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Server
CORS_ORIGIN=http://localhost:3001
SURREALDB_URL=http://localhost:8000
SURREALDB_NAMESPACE=timesheet
SURREALDB_DATABASE=production
SURREALDB_USER=root
SURREALDB_PASS=root

# Frontend
VITE_SERVER_URL=http://localhost:3000

# AI (optional — defaults to zai-coding-plan/glm-4.7)
AI_MODEL=your-model-identifier

# Integration credentials (see "Connecting External Services" below)
```

### 5. Start Development Servers

```bash
bun run dev
```

This starts all three apps simultaneously:
- **Web** → http://localhost:3001
- **API Server** → http://localhost:3000
- **Worker** → polls for jobs every 5 seconds

You can also run apps individually:

```bash
bun run dev:web      # Frontend only
bun run dev:server   # API only
bun run dev:worker   # Worker only
```

---

## Connecting External Services

Timesheet AI ingests activity from three sources via a plugin system. Each source is registered in the worker (`apps/worker/src/index.ts`) and accessed through integration connections stored in the database.

### Git Integration

The Git plugin clones/fetches repositories and parses commit logs (author, message, diff stats).

**Configuration** (stored as `configRef` on the integration connection, JSON-encoded):

```json
{
  "repoUrl": "https://github.com/your-org/your-repo.git",
  "localPath": "/tmp/timesheet-ai/repos/your-repo",
  "branch": "main",
  "authToken": "ghp_your_github_token"
}
```

| Field        | Required | Description |
|--------------|----------|-------------|
| `repoUrl`    | Yes      | HTTPS URL of the Git repository |
| `localPath`  | Yes      | Local path for the bare clone |
| `branch`     | No       | Specific branch to track (defaults to `--all`) |
| `authToken`  | No       | Personal access token for private repos (injected into HTTPS URL) |

**To set up:**
1. Create an integration connection via `POST /integrations` with `source: "git"` and the JSON config above as `configRef`.
2. Trigger a sync via `POST /integrations/:id/sync`.

### Discord Integration

The Discord plugin fetches channel messages via the Discord REST API (v10) and optionally connects to the Gateway WebSocket for real-time ingestion.

**Configuration** (JSON-encoded):

```json
{
  "botToken": "your_discord_bot_token",
  "guildId": "your_server_id",
  "channelIds": ["channel_id_1", "channel_id_2"]
}
```

| Field         | Required | Description |
|---------------|----------|-------------|
| `botToken`    | Yes      | Discord Bot Token from the Developer Portal |
| `guildId`     | Yes      | Discord server (guild) ID |
| `channelIds`  | Yes      | Array of channel IDs to ingest messages from |

**To set up:**
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a Bot application.
2. Enable the **Message Content Intent** and **Server Members Intent** under Privileged Gateway Intents.
3. Invite the bot to your server with `bot` and `guilds` scopes.
4. Create an integration connection via `POST /integrations` with `source: "discord"`.
5. The bot token and channel IDs are used both for REST API polling and the Gateway WebSocket connection.

**Gateway Intents used:**
- `GUILD_MESSAGES` (1 << 9)
- `MESSAGE_CONTENT` (1 << 15)

### Plane Integration

The Plane plugin fetches issues, activities, and comments from [Plane](https://plane.so/) (self-hosted or cloud) via its REST API.

**Configuration** (JSON-encoded):

```json
{
  "apiToken": "your_plane_api_token",
  "baseUrl": "https://api.plane.so",
  "workspaceSlug": "your-workspace",
  "projectIds": ["project-uuid-1", "project-uuid-2"]
}
```

| Field             | Required | Description |
|-------------------|----------|-------------|
| `apiToken`        | Yes      | Plane API token |
| `baseUrl`         | Yes      | Plane instance base URL (e.g., `https://api.plane.so` or your self-hosted URL) |
| `workspaceSlug`   | Yes      | Workspace slug |
| `projectIds`      | Yes      | Array of project IDs to track |

**To set up:**
1. Generate an API token from your Plane profile settings.
2. Create an integration connection via `POST /integrations` with `source: "plane"`.

### API Endpoints for Integration Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/integrations?orgId=...` | List integration connections |
| `POST` | `/integrations` | Create a new connection |
| `GET` | `/integrations/:id` | Get a specific connection |
| `PATCH` | `/integrations/:id/status` | Update connection status (`active`/`paused`/`error`) |
| `POST` | `/integrations/:id/sync` | Trigger an ingestion sync for a connection |

**Example — Create a Git integration:**

```bash
curl -X POST http://localhost:3000/integrations \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "your_org_id",
    "source": "git",
    "name": "My GitHub Repo",
    "configRef": "{\"repoUrl\":\"https://github.com/org/repo.git\",\"localPath\":\"/tmp/repo\",\"authToken\":\"ghp_xxx\"}"
  }'
```

**Example — Trigger a sync:**

```bash
curl -X POST http://localhost:3000/integrations/:connectionId/sync
```

### Other API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/health/db` | Database connectivity check |
| `GET` | `/events?userId=...&dateStart=...&dateEnd=...` | List events for a user |
| `GET` | `/timesheet?orgId=...&dateStart=...&dateEnd=...` | Get timesheet data (work units + summaries) |
| `GET` | `/sessions?orgId=...` | List activity sessions |
| `GET` | `/identities?orgId=...` | List external identities |
| `GET` | `/mappings?orgId=...` | List source mappings |
| `GET` | `/clusters?orgId=...` | List activity clusters |
| `GET` | `/work-units?orgId=...` | List work units |
| `GET` | `/daily-summaries?orgId=...` | List daily summaries |

---

## Testing Locally

### Run All Tests

```bash
bun test
```

### Run Tests for a Specific Package

```bash
bun test --filter @timesheet-ai/ingestion-git
bun test --filter @timesheet-ai/ingestion-discord
bun test --filter @timesheet-ai/ingestion-plane
bun test --filter @timesheet-ai/db
```

### Test Packages with Test Suites

| Package | Tests |
|---------|-------|
| `@timesheet-ai/ingestion-git` | normalizer, identity-extractor, scope-extractor |
| `@timesheet-ai/ingestion-discord` | normalizer, identity-extractor, scope-extractor, gateway |
| `@timesheet-ai/ingestion-plane` | normalizer, identity-extractor, scope-extractor |
| `@timesheet-ai/domain` | type tests |
| `@timesheet-ai/db` | database operations |
| `@timesheet-ai/sessionization` | session detection |
| `@timesheet-ai/attribution` | event attribution |
| `@timesheet-ai/identity` | identity resolution |
| `@timesheet-ai/ai` | AI agent tests |

### Code Quality Checks

Run these in order before submitting changes:

```bash
bun run fix           # Auto-fix lint/format issues (Biome via Ultracite)
bun run check-types  # TypeScript type checking across all packages
bun test             # Run all tests
```

### Manual Smoke Test

1. Start SurrealDB and run migrations (see Getting Started).
2. Start the server and worker: `bun run dev:server` and `bun run dev:worker`.
3. Check the health endpoint:
   ```bash
   curl http://localhost:3000/health
   curl http://localhost:3000/health/db
   ```
4. Create an organization and project via SurrealDB queries or API.
5. Create an integration connection and trigger a sync.
6. Check the worker logs for job execution (health-check, ingestion-sync, event-enrichment, identity-resolve, session-detection, work-unit-generation, daily-summary-generation).
7. Open http://localhost:3001 to view the dashboard.

### Test Environment

A `.env.test` file is provided with test fixtures:

```env
CORS_ORIGIN=http://localhost:3001
SURREALDB_URL=http://localhost:8000
```

---

## Running in Production

### Build

```bash
bun run build
```

This builds all apps using:
- **Server:** `tsdown` → bundled ESM output in `apps/server/dist/`
- **Worker:** `tsdown` → bundled ESM output in `apps/worker/dist/`
- **Web:** `vite build` → static assets in `apps/web/dist/`

### Run Built Artifacts

```bash
# Server
bun run --filter server start
# Or directly:
bun run apps/server/dist/index.mjs

# Worker
bun run --filter worker start
# Or directly:
bun run apps/worker/dist/index.mjs

# Web (static files — serve with any static file server)
bun run --filter web serve
```

### Compile to Standalone Binary (Server)

```bash
bun run --filter server compile
```

This produces a self-contained `server` binary using `bun build --compile`.

### Production Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | *(required)* | Allowed CORS origin (e.g., `https://your-app.com`) |
| `NODE_ENV` | `development` | Set to `production` |
| `SURREALDB_URL` | `http://localhost:8000` | SurrealDB connection URL |
| `SURREALDB_NAMESPACE` | `timesheet` | SurrealDB namespace |
| `SURREALDB_DATABASE` | `production` | SurrealDB database name |
| `SURREALDB_USER` | `root` | SurrealDB auth user |
| `SURREALDB_PASS` | `root` | SurrealDB auth password |
| `VITE_SERVER_URL` | *(required)* | API server URL (set at build time for the frontend) |
| `AI_MODEL` | `zai-coding-plan/glm-4.7` | AI model identifier for Mastra agents |

### Deployment Architecture

```
                    ┌─────────────────┐
                    │  Load Balancer   │
                    │  / Reverse Proxy │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Static Assets   │
                    │  (Frontend /dist)│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
              ┌─────┤  API Server     │
              │     │  (Elysia :3000) │
              │     └────────┬────────┘
              │              │
              │     ┌────────▼────────┐
              │     │  SurrealDB      │
              │     │  (:8000)        │
              │     └────────▲────────┘
              │              │
              │     ┌────────┴────────┐
              │     │  Worker          │
              │     │  (Effect-TS)     │
              │     └─────────────────┘
              │
              │     ┌─────────────────┐
              └────▶│  Git Repos       │
                    │  Discord API     │
                    │  Plane API       │
                    └─────────────────┘
```

**Recommended production setup:**

1. **SurrealDB** — Run in Docker or as a native binary with persistent storage. For high availability, consider SurrealDB clustering.
2. **API Server** — Run behind a reverse proxy (nginx, Caddy, or cloud load balancer). Set `CORS_ORIGIN` to your frontend domain.
3. **Worker** — Run as a background process or systemd service. It polls SurrealDB for pending jobs every 5 seconds.
4. **Frontend** — Serve the built static assets from `apps/web/dist/` via any static file server or CDN.
5. **AI Provider** — Configure `AI_MODEL` to use your preferred AI provider. The Mastra framework supports multiple providers via the Vercel AI SDK.

**Example systemd service (worker):**

```ini
[Unit]
Description=Timesheet AI Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/timesheet-ai
ExecStart=/usr/local/bin/bun run apps/worker/dist/index.mjs
Restart=always
RestartSec=5
EnvironmentFile=/opt/timesheet-ai/.env

[Install]
WantedBy=multi-user.target
```

**Example systemd service (server):**

```ini
[Unit]
Description=Timesheet AI API Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/timesheet-ai
ExecStart=/usr/local/bin/bun run apps/server/dist/index.mjs
Restart=always
RestartSec=5
EnvironmentFile=/opt/timesheet-ai/.env

[Install]
WantedBy=multi-user.target
```

---

## UI Customization

The frontend uses shared shadcn/ui primitives from `packages/ui`.

- **Design tokens/global styles:** `packages/ui/src/styles/globals.css`
- **Shared primitives:** `packages/ui/src/components/*`
- **Config:** `packages/ui/components.json` and `apps/web/components.json`

**Add shared components:**

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

**Import in your app:**

```tsx
import { Button } from "@timesheet-ai/ui/components/button";
```

---

## License

Private — All rights reserved.
