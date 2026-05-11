# timesheet-ai Agent Instructions

## Workspace Structure

```
apps/
  server/     # Elysia API server (port 3000)
  web/        # TanStack Start frontend (port 3001)
  worker/     # Background job runner (Effect-TS)
packages/
  ai/                 # AI integration
  attribution/        # Work attribution logic
  config/             # Shared TypeScript config (tsconfig.base.json)
  db/                 # SurrealDB wrapper
  domain/             # Domain models and types
  env/                # Environment variable schemas
  identity/           # User identity resolution
  ingestion-core/      # Plugin registration system
  ingestion-discord/  # Discord event ingestion
  ingestion-git/      # Git log ingestion
  ingestion-plane/    # Plane issue ingestion
  observability/      # Logging/metrics
  sessionization/     # Session detection
  shared/             # Shared utilities
  ui/                 # shadcn/ui component library
```

## Developer Commands

```bash
bun install              # Install dependencies
bun run dev              # Start all apps (server, web, worker)
bun run dev:web          # Frontend only (port 3001)
bun run dev:server       # API only (port 3000)
bun run dev:worker       # Worker only
bun run build            # Build all apps
bun run check-types      # TypeScript across all packages
bun run check            # Lint with Ultracite/Biome
bun run fix              # Auto-fix lint issues
bun test                 # Run tests (packages with test scripts)
bun test --filter @timesheet-ai/ingestion-git  # Run tests for specific package
bun run db:migrate       # Run database migrations
```

## Required Command Order

1. `bun run fix` (format/lint)
2. `bun run check-types` (typecheck)
3. `bun test` (tests)

## Architecture Notes

- **Effect-TS**: Worker uses Effect-TS extensively for async operations and dependency injection
- **SurrealDB**: Database is SurrealDB. Start with `docker compose -f infra/docker/docker-compose.yml up`
- **Plugin System**: Ingestion plugins (git, discord, plane) are registered via `registerPlugin()` in worker
- **Jobs**: Worker polls and executes registered job handlers on a 5s interval

## Environment Setup

- SurrealDB runs in Docker on port 8000 (see `infra/docker/docker-compose.yml`)
- Environment schema validation via `@timesheet-ai/env` package (uses Zod)
- `.env.test` exists for test fixtures

## Code Quality

- **Lint/Format**: `bun x ultracite fix` (Biome-based, auto-fixes most issues)
- **Biome overrides**: Some files have rule overrides in `biome.jsonc` (e.g., `packages/ui/src/components/chart.tsx`, `packages/identity/src/matcher.ts`)
- **Strict TypeScript**: `noUncheckedIndexedAccess`, `strictNullChecks` enabled

## Testing

- Tests use `bun test` in packages that define a test script
- Run tests for specific package: `bun test --filter @timesheet-ai/package-name`
- DB package (`packages/db`) includes test script

## Shared UI Components

- Import from `@timesheet-ai/ui/components/button"` etc.
- Add new shadcn components: `npx shadcn@latest add <component> -c packages/ui`
