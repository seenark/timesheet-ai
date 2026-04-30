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
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@timesheet-ai/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@timesheet-ai/ui/components/select";
import { Separator } from "@timesheet-ai/ui/components/separator";
import { Skeleton } from "@timesheet-ai/ui/components/skeleton";
import { createFileRoute, useRouter, useSearch } from "@tanstack/react-router";
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

function groupByDate(workUnits: WorkUnitItem[]): Map<string, WorkUnitItem[]> {
  const map = new Map<string, WorkUnitItem[]>();
  for (const wu of workUnits) {
    const existing = map.get(wu.date) ?? [];
    existing.push(wu);
    map.set(wu.date, existing);
  }
  return map;
}

function DashboardPage() {
  const search = useSearch({ from: "/dashboard" });
  const orgId = search.orgId ?? "org_default";
  const year = search.year ?? new Date().getFullYear();
  const month = search.month ?? new Date().getMonth() + 1;
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedWorkUnit, setSelectedWorkUnit] = useState<WorkUnitItem | null>(null);
  const router = useRouter();

  const { data, isLoading, error } = useTimesheet(
    orgId,
    year,
    month,
    selectedUser === "all" ? undefined : selectedUser,
    selectedProject === "all" ? undefined : selectedProject
  );

  const navigateMonth = (dir: -1 | 1) => {
    let m = month + dir;
    let y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    router.navigate({ to: "/dashboard", search: { orgId, year: y, month: m } });
  };

  const totalHours = data ? (data.totalMinutes / 60).toFixed(1) : "0";
  const grouped = data ? groupByDate(data.workUnits) : new Map<string, WorkUnitItem[]>();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-4">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-[180px] text-center text-xl font-semibold">
            {MONTH_NAMES[month - 1]} {year}
          </h1>
          <Button variant="outline" size="icon-sm" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Select value={selectedUser} onValueChange={(v) => setSelectedUser(v ?? "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedProject} onValueChange={(v) => setSelectedProject(v ?? "all")}>
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
        <Empty>
          <EmptyTitle>Failed to load data</EmptyTitle>
          <EmptyDescription>{error instanceof Error ? error.message : "Unknown error"}</EmptyDescription>
        </Empty>
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
        <Empty>
          <EmptyTitle>No work units</EmptyTitle>
          <EmptyDescription>No work units found for this period. Try adjusting the filters.</EmptyDescription>
        </Empty>
      )}

      {/* Day accordion */}
      {data && grouped.size > 0 && (
        <Accordion defaultValue={Array.from(grouped.keys()).slice(0, 5)}>
          {[...grouped.entries()]
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, units]) => {
              const dayMinutes = units.reduce((sum, wu) => sum + wu.estimatedMinutes, 0);
              return (
                <AccordionItem key={date} value={date}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex w-full items-center justify-between pr-4">
                      <span className="font-medium">{formatDate(date)}</span>
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
                                <div className={`h-2 w-2 rounded-full ${confidenceColor(wu.confidence)}`} />
                                <CardTitle className="text-sm">{wu.title}</CardTitle>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{formatMinutes(wu.estimatedMinutes)}</Badge>
                                <Badge variant="secondary">{wu.confidence.toFixed(2)}</Badge>
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
      <Dialog open={!!selectedWorkUnit} onOpenChange={(open) => !open && setSelectedWorkUnit(null)}>
        {selectedWorkUnit && (
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedWorkUnit.title}</DialogTitle>
              <DialogDescription>
                {formatDate(selectedWorkUnit.date)} · {formatMinutes(selectedWorkUnit.estimatedMinutes)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="mb-1 text-sm font-medium text-muted-foreground">Summary</h4>
                <p className="text-sm">{selectedWorkUnit.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Confidence: {selectedWorkUnit.confidence.toFixed(2)}</Badge>
                {selectedWorkUnit.sourceTypes.map((st) => (
                  <Badge key={st} variant="secondary">{st}</Badge>
                ))}
              </div>
              <Separator />
              <div className="text-xs text-muted-foreground">
                <div>Time: {selectedWorkUnit.startedAt} → {selectedWorkUnit.endedAt}</div>
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
