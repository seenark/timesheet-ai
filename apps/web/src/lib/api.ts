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
