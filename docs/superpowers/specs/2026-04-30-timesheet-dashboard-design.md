# Phase 6: Monthly Timesheet Dashboard

## Overview

A view-only web dashboard that displays AI-generated work units and daily summaries for a given month. Users filter by project or person to review timesheet data at month-end.

## Architecture

```
Browser (TanStack Start)
  └─ /dashboard?orgId=&year=&month=&userId=&projectId=
       └─ TanStack Query → GET /api/timesheet?orgId=&dateStart=&dateEnd=&userId=&projectId=
                              └─ Elysia route → work-unit.repo + daily-summary.repo → SurrealDB
```

Single API endpoint returns all data the dashboard needs. One page component with one TanStack Query hook.

## Backend

### New Route: `GET /timesheet`

**File**: `apps/server/src/routes/timesheet.ts`

**Query parameters**:
- `orgId` (required) — organization ID
- `dateStart` (required) — ISO date string, e.g. `2026-04-01`
- `dateEnd` (required) — ISO date string, e.g. `2026-04-30`
- `userId` (optional) — filter to a specific user
- `projectId` (optional) — filter to a specific project

**Response**:
```json
{
  "ok": true,
  "data": {
    "workUnits": [
      {
        "id": "work_xxx",
        "title": "Implemented user auth",
        "summary": "Added JWT-based authentication...",
        "date": "2026-04-15",
        "estimatedMinutes": 90,
        "confidence": 0.85,
        "sourceTypes": ["git", "plane"],
        "projectId": "proj_xxx",
        "canonicalUserId": "cuser_xxx",
        "startedAt": "2026-04-15T09:00:00Z",
        "endedAt": "2026-04-15T10:30:00Z"
      }
    ],
    "summaries": [
      {
        "id": "sum_xxx",
        "date": "2026-04-15",
        "scopeType": "user",
        "scopeId": "cuser_xxx",
        "summary": "Completed authentication implementation..."
      }
    ],
    "totalMinutes": 1440,
    "totalWorkUnits": 18
  }
}
```

**Logic**:
1. Parse query params
2. Build date range: `dateStartT00:00:00Z` to `dateEndT23:59:59Z`
3. If `userId` provided → `listWorkUnitsByUser(userId, start, end)`
4. If `projectId` provided → `listWorkUnitsByProject(projectId, start, end)`
5. If neither → `listWorkUnitsByOrg(orgId)` then filter client-side by date range
6. Fetch summaries: `listSummariesByOrg(orgId)` filtered by date range
7. Return aggregated response

**No new repos needed** — existing `listWorkUnitsByUser`, `listWorkUnitsByProject`, `listWorkUnitsByOrg`, `listSummariesByOrg` cover all cases.

**Register** in `apps/server/src/routes/index.ts`.

### Proxy Setup

The web app (port 3001) needs to proxy `/api/*` requests to the API server (port 3000). Add a Vite proxy config in `apps/web/app.config.ts` or use TanStack Start's server functions.

Two options:
- **Option A (Recommended)**: Vite dev proxy — add `server.proxy` to Vite config so `/api/*` forwards to `localhost:3000`
- **Option B**: TanStack Start server functions — create server-side functions that call the API

Use Option A for simplicity. The production deployment would handle this via a reverse proxy.

## Frontend

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/routes/dashboard.tsx` | Dashboard page component |
| `apps/web/src/hooks/use-timesheet.ts` | TanStack Query hook for `GET /timesheet` |
| `apps/web/src/lib/api.ts` | API client (fetch wrapper with base URL) |

### Dashboard Page Layout

```
┌─────────────────────────────────────────────────┐
│  ◀ April 2026 ▶    [User ▼]  [Project ▼]       │
│  Total: 24 hours · 18 work units                 │
├─────────────────────────────────────────────────┤
│  ▼ April 30, 2026                    3h 30m      │
│  ┌──────────────────────────────────────────┐   │
│  │ ● Implemented user auth    90 min  0.85  │   │
│  │ ● Fixed login redirect     30 min  0.90  │   │
│  │ ● Team standup discussion  90 min  0.60  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ▼ April 29, 2026                    4h 00m      │
│  ┌──────────────────────────────────────────┐   │
│  │ ● API endpoint design      120 min 0.80  │   │
│  │ ● Database migration       120 min 0.75  │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ▶ April 28, 2026                    2h 00m      │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

### Page Sections

**1. Header bar**:
- Month/year navigation: `◀` / `▶` buttons flanking "April 2026"
- User filter: shadcn `Select` dropdown populated from API (or hardcoded org users)
- Project filter: shadcn `Select` dropdown populated from API

**2. Summary bar**:
- Total hours: `sum(estimatedMinutes) / 60` formatted as "24 hours"
- Total work units count
- Updates when filters change

**3. Day accordion**:
- shadcn `Accordion` with one `AccordionItem` per day (descending date order)
- Each item header shows: formatted date (e.g. "Wed, April 30") + total minutes for that day
- Days with no work units are hidden
- All days expanded by default (or most recent 5 days expanded)

**4. Work unit cards** (inside each accordion item):
- shadcn `Card` per work unit, compact layout
- Left: colored dot (green=high confidence, yellow=medium, red=low)
- Title, estimated time, confidence badge
- Click opens a shadcn `Dialog` with full details (summary, evidence events, time range, source types)

**5. Empty state**:
- shadcn `Empty` component when no work units match filters

**6. Loading state**:
- shadcn `Skeleton` placeholders while data loads

### Data Fetching

**API client** (`apps/web/src/lib/api.ts`):
```typescript
const API_BASE = "/api";

export async function fetchTimesheet(params: {
  orgId: string;
  dateStart: string;
  dateEnd: string;
  userId?: string;
  projectId?: string;
}) {
  const searchParams = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null)
  );
  const response = await fetch(`${API_BASE}/timesheet?${searchParams}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
```

**TanStack Query hook** (`apps/web/src/hooks/use-timesheet.ts`):
```typescript
export function useTimesheet(
  orgId: string,
  year: number,
  month: number,
  userId?: string,
  projectId?: string
) {
  const dateStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateEnd = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

  return useQuery({
    queryKey: ["timesheet", orgId, dateStart, dateEnd, userId, projectId],
    queryFn: () => fetchTimesheet({ orgId, dateStart, dateEnd, userId, projectId }),
  });
}
```

### shadcn Components Used

| Component | Usage |
|-----------|-------|
| `Accordion` | Day grouping (expand/collapse per day) |
| `Card` | Work unit rows |
| `Select` | User and project filter dropdowns |
| `Badge` | Confidence level, source type tags |
| `Button` | Month navigation (prev/next) |
| `Dialog` | Work unit detail overlay |
| `Skeleton` | Loading placeholders |
| `Empty` | No data state |
| `Separator` | Visual dividers |

No new components need to be built — all 9 are available in the 55 shadcn components.

### Route Registration

Add to `apps/web/src/routes/`:
- `dashboard.tsx` using TanStack Start file-based routing

Update `apps/web/src/components/header.tsx` to add a "Dashboard" navigation link.

## Error Handling

- API errors: TanStack Query handles retry/error states automatically
- Empty data: Show `Empty` component with "No work units found for this period"
- Loading: Show `Skeleton` placeholders matching the layout shape
- Invalid params: Default to current month/year if not provided

## Testing

- Backend: Test the `/timesheet` route with various filter combinations
- Frontend: Test the TanStack Query hook with mocked API responses
- Integration: Verify the full flow from DB → API → dashboard renders correctly

## Scope Exclusions

- No review/approval workflow
- No editing of work units or summaries
- No export (CSV/PDF)
- No authentication (uses `orgId` query param, same as existing routes)
- No real-time updates (page refresh to see new data)
