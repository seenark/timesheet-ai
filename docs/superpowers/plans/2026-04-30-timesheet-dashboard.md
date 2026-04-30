# Phase 6: Timesheet Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monthly timesheet dashboard that displays AI-generated work units and summaries in a view-only web UI.

**Architecture:** Single API endpoint returns work units + summaries for a date range. TanStack Start dashboard page uses TanStack Query to fetch data and renders day-grouped accordion with shadcn components.

**Tech Stack:** TanStack Start (file-based routing), TanStack Query v5, Elysia (API), shadcn/ui (55 components), Tailwind CSS v4

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/db/src/repositories/work-unit.repo.ts` | Modify | Add `listWorkUnitsByOrgDateRange` |
| `packages/db/src/repositories/daily-summary.repo.ts` | Modify | Add `listSummariesByOrgDateRange` |
| `packages/db/src/repositories/index.ts` | Modify | Export new functions |
| `packages/db/src/index.ts` | Modify | Re-export new functions |
| `apps/server/src/routes/timesheet.ts` | Create | `GET /timesheet` endpoint |
| `apps/server/src/routes/index.ts` | Modify | Register timesheet route |
| `apps/web/src/lib/api.ts` | Create | Fetch wrapper for API calls |
| `apps/web/src/hooks/use-timesheet.ts` | Create | TanStack Query hook |
| `apps/web/src/routes/dashboard.tsx` | Create | Dashboard page |
| `apps/web/src/routes/__root.tsx` | Modify | Wrap with QueryClientProvider |
| `apps/web/src/components/header.tsx` | Modify | Add Dashboard nav link |
| `apps/web/vite.config.ts` | Modify | Add API proxy |
| `biome.jsonc` | Modify | Add barrel overrides if needed |

---

### Task 1: Add date-range repo functions

**Files:**
- Modify: `packages/db/src/repositories/work-unit.repo.ts`
- Modify: `packages/db/src/repositories/daily-summary.repo.ts`
- Modify: `packages/db/src/repositories/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Add `listWorkUnitsByOrgDateRange` to work-unit.repo.ts**

Add after `listWorkUnitsByOrg` (after line 122):

```typescript
export const listWorkUnitsByOrgDateRange = (
  organizationId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM work_unit
       WHERE organizationId = $orgId
       AND date >= $start
       AND date <= $end
       ORDER BY date DESC, startedAt ASC`,
      {
        orgId: `organization:${organizationId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [WorkUnit[]];
    return (result ?? []) as WorkUnit[];
  });
```

- [ ] **Step 2: Add `listSummariesByOrgDateRange` to daily-summary.repo.ts**

Add after `listSummariesByOrg` (after line 93):

```typescript
export const listSummariesByOrgDateRange = (
  organizationId: string,
  dateStart: string,
  dateEnd: string
) =>
  Effect.gen(function* () {
    const db = yield* SurrealDbTag;
    const [result] = (yield* db.query(
      `SELECT * FROM daily_summary
       WHERE organizationId = $orgId
       AND date >= $start
       AND date <= $end
       ORDER BY date ASC`,
      {
        orgId: `organization:${organizationId}`,
        start: dateStart,
        end: dateEnd,
      }
    )) as unknown as [DailySummary[]];
    return (result ?? []) as DailySummary[];
  });
```

- [ ] **Step 3: Update barrel exports**

Add `listWorkUnitsByOrgDateRange` to `packages/db/src/repositories/index.ts` exports (in the work-unit section).

Add `listSummariesByOrgDateRange` to `packages/db/src/repositories/index.ts` exports (in the daily-summary section).

Add both to `packages/db/src/index.ts` re-exports.

- [ ] **Step 4: Run typecheck**

Run: `cd packages/db && bun run check-types`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add date-range queries for work units and summaries"
```

---

### Task 2: Create timesheet API route

**Files:**
- Create: `apps/server/src/routes/timesheet.ts`
- Modify: `apps/server/src/routes/index.ts`

- [ ] **Step 1: Create `apps/server/src/routes/timesheet.ts`**

```typescript
import {
  listSummariesByOrgDateRange,
  listSummariesByScope,
  listWorkUnitsByOrgDateRange,
  listWorkUnitsByProject,
  listWorkUnitsByUser,
  SurrealDb,
} from "@timesheet-ai/db";
import { Effect } from "effect";
import { Elysia, t } from "elysia";

export const timesheetRoutes = new Elysia({ prefix: "/timesheet" }).get(
  "/",
  async ({ query }) => {
    const effect = Effect.gen(function* () {
      const dateStart = query.dateStart;
      const dateEnd = query.dateEnd;

      let workUnits;
      if (query.userId) {
        workUnits = yield* listWorkUnitsByUser(
          query.userId,
          dateStart,
          dateEnd
        );
      } else if (query.projectId) {
        workUnits = yield* listWorkUnitsByProject(
          query.projectId,
          dateStart,
          dateEnd
        );
      } else {
        workUnits = yield* listWorkUnitsByOrgDateRange(
          query.orgId,
          dateStart,
          dateEnd
        );
      }

      const summaries = query.userId
        ? yield* listSummariesByScope("user", query.userId, dateStart, dateEnd)
        : yield* listSummariesByOrgDateRange(query.orgId, dateStart, dateEnd);

      const totalMinutes = workUnits.reduce(
        (sum, wu) => sum + wu.estimatedMinutes,
        0
      );

      return {
        summaries,
        totalMinutes,
        totalWorkUnits: workUnits.length,
        workUnits: workUnits.map(stripRecordPrefixes),
      };
    }).pipe(Effect.provide(SurrealDb));

    try {
      const result = await Effect.runPromise(effect);
      return { ok: true as const, data: result };
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "INTERNAL_ERROR",
          message: String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
  {
    query: t.Object({
      orgId: t.String(),
      dateStart: t.String(),
      dateEnd: t.String(),
      userId: t.Optional(t.String()),
      projectId: t.Optional(t.String()),
    }),
  }
);

const stripRecordPrefixes = (wu: Record<string, unknown>) => ({
  ...wu,
  canonicalUserId: String(wu.canonicalUserId ?? "").replace(
    "canonical_user:",
    ""
  ),
  id: String(wu.id ?? ""),
  organizationId: String(wu.organizationId ?? "").replace("organization:", ""),
  projectId: String(wu.projectId ?? "").replace("project:", ""),
});
```

- [ ] **Step 2: Register route in `apps/server/src/routes/index.ts`**

Add import and `.use(timesheetRoutes)` following the existing pattern:

```typescript
import { timesheetRoutes } from "./timesheet";
```

Add `.use(timesheetRoutes)` after the last `.use()` call.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/server && bun run check-types`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/server/
git commit -m "feat(server): add timesheet API route for dashboard"
```

---

### Task 3: Set up TanStack Query and API proxy

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add Vite proxy for API**

Modify `apps/web/vite.config.ts` to add proxy config:

```typescript
export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
```

- [ ] **Step 2: Create `apps/web/src/lib/api.ts`**

```typescript
const API_BASE = "/api";

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | undefined>
): Promise<T> {
  const searchParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        searchParams.set(key, value);
      }
    }
  }

  const url = `${API_BASE}${path}${searchParams.toString() ? `?${searchParams}` : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const json = (await response.json()) as { ok: boolean; data: T };
  return json.data;
}

export interface TimesheetData {
  workUnits: WorkUnitItem[];
  summaries: SummaryItem[];
  totalMinutes: number;
  totalWorkUnits: number;
}

export interface WorkUnitItem {
  id: string;
  title: string;
  summary: string;
  date: string;
  estimatedMinutes: number;
  confidence: number;
  sourceTypes: string[];
  projectId: string;
  canonicalUserId: string;
  startedAt: string;
  endedAt: string;
}

export interface SummaryItem {
  id: string;
  date: string;
  scopeType: string;
  scopeId: string;
  summary: string;
}

export function fetchTimesheet(params: {
  orgId: string;
  dateStart: string;
  dateEnd: string;
  userId?: string;
  projectId?: string;
}): Promise<TimesheetData> {
  return apiFetch<TimesheetData>("/timesheet", params);
}
```

- [ ] **Step 3: Add QueryClientProvider to root layout**

Modify `apps/web/src/routes/__root.tsx`:

Add imports:
```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```

Add QueryClient instantiation (module-level, outside component):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
```

Wrap the `<div className="grid...">` in `<QueryClientProvider client={queryClient}>`:
```tsx
function RootDocument() {
  return (
    <html className="dark" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <div className="grid h-svh grid-rows-[auto_1fr]">
            <Header />
            <Outlet />
          </div>
          <Toaster richColors />
          <TanStackRouterDevtools position="bottom-left" />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && bun run check-types` (if available) or `bun x tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add API proxy, client, and TanStack Query provider"
```

---

### Task 4: Create TanStack Query hook

**Files:**
- Create: `apps/web/src/hooks/use-timesheet.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from "@tanstack/react-query";
import { fetchTimesheet } from "../lib/api";

export function useTimesheet(
  orgId: string,
  year: number,
  month: number,
  userId?: string,
  projectId?: string
) {
  const monthStr = String(month).padStart(2, "0");
  const dateStart = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateEnd = `${year}-${monthStr}-${lastDay}`;

  return useQuery({
    queryKey: [
      "timesheet",
      orgId,
      dateStart,
      dateEnd,
      userId ?? "",
      projectId ?? "",
    ],
    queryFn: () =>
      fetchTimesheet({ orgId, dateStart, dateEnd, userId, projectId }),
    enabled: !!orgId,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat(web): add useTimesheet TanStack Query hook"
```

---

### Task 5: Create dashboard page

**Files:**
- Create: `apps/web/src/routes/dashboard.tsx`

This is the main page. It uses shadcn Accordion, Card, Badge, Button, Select, Dialog, Skeleton, Empty.

- [ ] **Step 1: Create the dashboard route file**

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@timesheet-ai/ui/components/accordion";
import { Badge } from "@timesheet-ai/ui/components/badge";
import { Button } from "@timesheet-ai/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@timesheet-ai/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@timesheet-ai/ui/components/dialog";
import { Empty } from "@timesheet-ai/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@timesheet-ai/ui/components/select";
import { Separator } from "@timesheet-ai/ui/components/separator";
import { Skeleton } from "@timesheet-ai/ui/components/skeleton";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTimesheet } from "../hooks/use-timesheet";
import type { WorkUnitItem } from "../lib/api";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>) => ({
    orgId: (search.orgId as string) ?? "org_default",
    year: Number(search.year) || new Date().getFullYear(),
    month: Number(search.month) || new Date().getMonth() + 1,
  }),
});

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const formatMinutes = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDate();
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday}, ${MONTH_NAMES[d.getUTCMonth()]} ${day}`;
};

const confidenceColor = (c: number): string => {
  if (c >= 0.8) return "bg-green-500";
  if (c >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
};

function groupByDate(
  workUnits: WorkUnitItem[]
): Map<string, WorkUnitItem[]> {
  const map = new Map<string, WorkUnitItem[]>();
  for (const wu of workUnits) {
    const existing = map.get(wu.date) ?? [];
    existing.push(wu);
    map.set(wu.date, existing);
  }
  return map;
}

function DashboardPage() {
  const { orgId, year, month } = useSearch({
    from: "/dashboard",
  });
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedWorkUnit, setSelectedWorkUnit] = useState<WorkUnitItem | null>(
    null
  );
  const navigate = useNavigate();

  const { data, isLoading, error } = useTimesheet(
    orgId,
    year,
    month,
    selectedUser === "all" ? undefined : selectedUser,
    selectedProject === "all" ? undefined : selectedProject
  );

  const navigate = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    navigate({ to: "/dashboard", search: { orgId, year: y, month: m } });
  };

  const totalHours = data ? (data.totalMinutes / 60).toFixed(1) : "0";
  const grouped = data ? groupByDate(data.workUnits) : new Map();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-[180px] text-center text-xl font-semibold">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => navigate(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Select
            value={selectedUser}
            onValueChange={setSelectedUser}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={selectedProject}
            onValueChange={setSelectedProject}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary bar */}
      <div className="mb-4 text-sm text-muted-foreground">
        {isLoading ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <>
            Total: <strong>{totalHours} hours</strong> ·{" "}
            <strong>{data?.totalWorkUnits ?? 0}</strong> work units
          </>
        )}
      </div>

      <Separator className="mb-4" />

      {/* Error state */}
      {error && (
        <Empty
          title="Failed to load data"
          description={error.message}
          icon="alert-circle"
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data && data.workUnits.length === 0 && (
        <Empty
          title="No work units"
          description="No work units found for this period. Try adjusting the filters."
          icon="calendar"
        />
      )}

      {/* Day accordion */}
      {data && grouped.size > 0 && (
        <Accordion
          type="multiple"
          defaultValue={Array.from(grouped.keys()).slice(0, 5)}
        >
          {[...grouped.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, units]) => {
              const dayMinutes = units.reduce(
                (sum, wu) => sum + wu.estimatedMinutes,
                0
              );
              return (
                <AccordionItem key={date} value={date}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex w-full items-center justify-between pr-4">
                      <span className="font-medium">
                        {formatDate(date)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatMinutes(dayMinutes)}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pb-2">
                      {units.map((wu) => (
                        <Card
                          key={wu.id}
                          className="cursor-pointer transition-colors hover:bg-muted/50"
                          onClick={() => setSelectedWorkUnit(wu)}
                        >
                          <CardHeader className="px-4 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`h-2 w-2 rounded-full ${confidenceColor(wu.confidence)}`}
                                />
                                <CardTitle className="text-sm">
                                  {wu.title}
                                </CardTitle>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">
                                  {formatMinutes(wu.estimatedMinutes)}
                                </Badge>
                                <Badge variant="secondary">
                                  {wu.confidence.toFixed(2)}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
        </Accordion>
      )}

      {/* Work unit detail dialog */}
      <Dialog
        open={!!selectedWorkUnit}
        onOpenChange={(open) => !open && setSelectedWorkUnit(null)}
      >
        {selectedWorkUnit && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedWorkUnit.title}</DialogTitle>
              <DialogDescription>
                {formatDate(selectedWorkUnit.date)} ·{" "}
                {formatMinutes(selectedWorkUnit.estimatedMinutes)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                  Summary
                </h4>
                <p className="text-sm">{selectedWorkUnit.summary}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">
                  Confidence: {selectedWorkUnit.confidence.toFixed(2)}
                </Badge>
                {selectedWorkUnit.sourceTypes.map((st) => (
                  <Badge key={st} variant="secondary">
                    {st}
                  </Badge>
                ))}
              </div>

              <Separator />

              <div className="text-xs text-muted-foreground">
                <div>
                  Time: {selectedWorkUnit.startedAt} →{" "}
                  {selectedWorkUnit.endedAt}
                </div>
                <div>User: {selectedWorkUnit.canonicalUserId}</div>
                <div>Project: {selectedWorkUnit.projectId}</div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/routes/dashboard.tsx
git commit -m "feat(web): add monthly timesheet dashboard page"
```

---

### Task 6: Add Dashboard nav link and update header

**Files:**
- Modify: `apps/web/src/components/header.tsx`

- [ ] **Step 1: Update header with Dashboard link**

```typescript
import { Link } from "@tanstack/react-router";

export default function Header() {
  const links = [
    { to: "/", label: "Home" },
    { to: "/dashboard", label: "Dashboard" },
  ] as const;

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2" />
      </div>
      <hr />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/header.tsx
git commit -m "feat(web): add Dashboard link to header navigation"
```

---

### Task 7: Lint, typecheck, fix

- [ ] **Step 1: Run ultracite fix**

Run: `cd /home/codesook/CodeSook/timesheet-ai && bun x ultracite fix`

- [ ] **Step 2: Run ultracite check**

Run: `bun x ultracite check`
Expected: No errors. If there are complexity errors in new files, add biome overrides.

- [ ] **Step 3: Run typecheck across monorepo**

Run: `bun run check-types`
Expected: All packages pass.

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All existing tests pass (127+).

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "style: apply lint fixes for Phase 6"
```
