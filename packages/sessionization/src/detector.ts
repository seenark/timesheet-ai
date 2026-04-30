import {
  DEFAULT_CONFIG,
  type DetectedSession,
  type SessionInput,
  type SessionizationConfig,
} from "./types";

export const detectSessions = (
  events: readonly SessionInput[],
  config: SessionizationConfig = DEFAULT_CONFIG
): DetectedSession[] => {
  const byUser = groupByUser(events);
  const sessions: DetectedSession[] = [];

  for (const [, userEvents] of byUser) {
    const sorted = [...userEvents].sort(
      (a, b) =>
        new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
    );

    if (sorted.length < config.minSessionEvents) {
      continue;
    }

    let currentSession = newSession(sorted[0]!);

    for (let i = 1; i < sorted.length; i++) {
      const gapMs =
        new Date(sorted[i]!.eventTime).getTime() -
        new Date(sorted[i - 1]!.eventTime).getTime();
      const gapMin = gapMs / (1000 * 60);

      if (gapMin > config.sessionGapMinutes) {
        sessions.push(currentSession);
        currentSession = newSession(sorted[i]!);
      } else {
        currentSession = appendToSession(currentSession, sorted[i]!);
      }
    }
    sessions.push(currentSession);
  }

  return sessions;
};

const newSession = (event: SessionInput): DetectedSession => ({
  canonicalUserId: event.canonicalUserId,
  endedAt: event.eventTime,
  eventIds: [event.id],
  organizationId: event.organizationId,
  projectIds: event.projectId ? [event.projectId] : [],
  startedAt: event.eventTime,
});

const appendToSession = (
  session: DetectedSession,
  event: SessionInput
): DetectedSession => ({
  ...session,
  endedAt: event.eventTime,
  eventIds: [...session.eventIds, event.id],
  projectIds:
    event.projectId && !session.projectIds.includes(event.projectId)
      ? [...session.projectIds, event.projectId]
      : session.projectIds,
});

const groupByUser = (
  events: readonly SessionInput[]
): Map<string, SessionInput[]> => {
  const map = new Map<string, SessionInput[]>();
  for (const event of events) {
    const existing = map.get(event.canonicalUserId) ?? [];
    existing.push(event);
    map.set(event.canonicalUserId, existing);
  }
  return map;
};
