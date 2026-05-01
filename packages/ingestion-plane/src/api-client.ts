import type { PlaneConfig, PlaneIssue, PlaneIssueEnvelope } from "./types";

const fetchJSON = async <T>(url: string, token: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Plane API error: ${response.status} ${response.statusText}`
    );
  }
  return response.json() as Promise<T>;
};

export const fetchIssuesSince = async (
  config: PlaneConfig,
  cursor: string | undefined
): Promise<readonly PlaneIssue[]> => {
  const issues: PlaneIssue[] = [];
  for (const projectId of config.projectIds) {
    let url = `${config.baseUrl}/api/workspaces/${config.workspaceSlug}/projects/${projectId}/issues/`;
    if (cursor) {
      url += `?updated_at__gte=${encodeURIComponent(cursor)}`;
    }
    const result = await fetchJSON<PlaneIssue[]>(url, config.apiToken);
    issues.push(...result);
  }
  return issues;
};

export const fetchIssueDetails = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<{
  activities: readonly unknown[];
  comments: readonly unknown[];
}> => {
  const [activities, comments] = await Promise.all([
    fetchJSON<unknown[]>(
      `${config.baseUrl}/api/workspaces/${config.workspaceSlug}/projects/${projectId}/issues/${issueId}/activities/`,
      config.apiToken
    ),
    fetchJSON<unknown[]>(
      `${config.baseUrl}/api/workspaces/${config.workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
      config.apiToken
    ),
  ]);
  return { activities, comments };
};

export const buildIssueEnvelopes = async (
  config: PlaneConfig,
  issues: readonly PlaneIssue[]
): Promise<readonly PlaneIssueEnvelope[]> => {
  const envelopes: PlaneIssueEnvelope[] = [];
  for (const issue of issues) {
    const { activities, comments } = await fetchIssueDetails(
      config,
      issue.project,
      issue.id
    );
    envelopes.push({
      issue,
      activities: activities as PlaneIssueEnvelope["activities"],
      comments: comments as PlaneIssueEnvelope["comments"],
    });
  }
  return envelopes;
};
