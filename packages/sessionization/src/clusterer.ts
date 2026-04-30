import type { DetectedCluster, SessionInput } from "./types";

export const detectClusters = (
  sessionEvents: readonly SessionInput[],
  sessionId?: string
): DetectedCluster[] => {
  const byProject = groupByProject(sessionEvents);
  const clusters: DetectedCluster[] = [];

  for (const [projectId, projectEvents] of byProject) {
    const topics = groupByTopic(projectEvents);

    if (topics.size <= 1) {
      const topicLabel = topics.keys().next().value as string | undefined;
      clusters.push(buildCluster(projectEvents, projectId, "project", topicLabel, sessionId));
    } else {
      for (const [topicLabel, topicEvents] of topics) {
        clusters.push(buildCluster(topicEvents, projectId, "topic", topicLabel, sessionId));
      }
    }
  }

  const unassigned = sessionEvents.filter((e) => !e.projectId);
  if (unassigned.length > 0) {
    clusters.push(buildCluster(unassigned, undefined, "mixed", undefined, sessionId));
  }

  return clusters;
};

const groupByProject = (
  events: readonly SessionInput[]
): Map<string, SessionInput[]> => {
  const map = new Map<string, SessionInput[]>();
  for (const event of events) {
    if (!event.projectId) {
      continue;
    }
    const existing = map.get(event.projectId) ?? [];
    existing.push(event);
    map.set(event.projectId, existing);
  }
  return map;
};

const groupByTopic = (
  events: readonly SessionInput[]
): Map<string, SessionInput[]> => {
  const map = new Map<string, SessionInput[]>();
  for (const event of events) {
    const topic = deriveTopic(event);
    const existing = map.get(topic) ?? [];
    existing.push(event);
    map.set(topic, existing);
  }
  return map;
};

const deriveTopic = (event: SessionInput): string => {
  if (event.content.branch) {
    return `branch:${event.content.branch.split("/").slice(0, 2).join("/")}`;
  }
  if (event.content.taskId) {
    return `task:${event.content.taskId}`;
  }
  return "untagged";
};

const buildCluster = (
  events: readonly SessionInput[],
  projectId: string | undefined,
  clusterType: DetectedCluster["clusterType"],
  topicLabel: string | undefined,
  sessionId: string | undefined
): DetectedCluster => {
  const sorted = [...events].sort(
    (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
  );
  return {
    canonicalUserId: sorted[0]!.canonicalUserId,
    clusterType,
    endedAt: sorted[sorted.length - 1]!.eventTime,
    eventIds: sorted.map((e) => e.id),
    organizationId: sorted[0]!.organizationId,
    projectId,
    sessionId,
    startedAt: sorted[0]!.eventTime,
    topicLabel: topicLabel === "untagged" ? undefined : topicLabel,
  };
};
