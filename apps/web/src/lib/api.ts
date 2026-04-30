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
  summaries: SummaryItem[];
  totalMinutes: number;
  totalWorkUnits: number;
  workUnits: WorkUnitItem[];
}

export interface WorkUnitItem {
  canonicalUserId: string;
  confidence: number;
  date: string;
  endedAt: string;
  estimatedMinutes: number;
  id: string;
  projectId: string;
  sourceTypes: string[];
  startedAt: string;
  summary: string;
  title: string;
}

export interface SummaryItem {
  date: string;
  id: string;
  scopeId: string;
  scopeType: string;
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
