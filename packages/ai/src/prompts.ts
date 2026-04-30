import type { ActivityCluster, NormalizedEvent, WorkUnit } from "@timesheet-ai/domain";

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
}

function formatEventDetails(event: NormalizedEvent): string {
  const time = formatTimestamp(event.eventTime);
  const source = event.source;
  const eventType = event.sourceEventType;

  switch (`${source}.${eventType}`) {
    case "git.commit": {
      const branch = event.content.branch ?? "unknown";
      const sha = event.content.commitSha?.slice(0, 7) ?? "???????";
      const message = event.content.title ?? event.content.body ?? "No message";
      const files = event.content.fileCount ?? 0;
      const additions = event.content.additions ?? 0;
      const deletions = event.content.deletions ?? 0;
      return `Branch: ${branch} - Commit: ${sha} - "${message}"\n   - Files: ${files}, +${additions}/-${deletions}`;
    }
    case "git.push": {
      const branch = event.content.branch ?? "unknown";
      const commitCount = event.content.tags?.length ?? 0;
      return `Branch: ${branch} - ${commitCount} commit(s)`;
    }
    case "plane.issue_updated": {
      const title = event.content.title ?? "Untitled";
      const status = event.content.taskStatus ?? "unknown";
      const taskId = event.content.taskId ?? "";
      return `Title: "${title}" - Status: ${status} - Task ID: ${taskId}`;
    }
    case "plane.issue_created": {
      const title = event.content.title ?? "Untitled";
      const taskId = event.content.taskId ?? "";
      return `Title: "${title}" - Task ID: ${taskId}`;
    }
    case "discord.message": {
      const channel = event.content.channelName ?? "unknown";
      const message = event.content.message ?? "";
      const preview = message.length > 100 ? `${message.slice(0, 100)}...` : message;
      return `Channel: ${channel} - Message: "${preview}"`;
    }
    default: {
      const parts: string[] = [`Source: ${source}.${eventType}`, `Time: ${time}`];
      if (event.content.title) parts.push(`Title: "${event.content.title}"`);
      if (event.content.body) parts.push(`Body: "${event.content.body}"`);
      if (event.content.message) {
        const msg = event.content.message.length > 100
          ? `${event.content.message.slice(0, 100)}...`
          : event.content.message;
        parts.push(`Message: "${msg}"`);
      }
      return parts.join(" - ");
    }
  }
}

export function formatEventsForWorkUnit(
  cluster: ActivityCluster,
  events: NormalizedEvent[],
): string {
  const lines: string[] = ["## Activity Cluster"];
  lines.push(`- Cluster ID: ${cluster.id}`);
  lines.push(`- Type: ${cluster.clusterType}`);

  if (cluster.topicLabel) {
    lines.push(`- Topic: ${cluster.topicLabel}`);
  }

  if (cluster.projectId) {
    lines.push(`- Project: ${cluster.projectId}`);
  }

  const startTime = formatTimestamp(cluster.startedAt);
  const endTime = formatTimestamp(cluster.endedAt);
  lines.push(`- Time window: ${startTime} to ${endTime}`);
  lines.push(`- Events: ${events.length} total`);

  lines.push("");
  lines.push("### Events:");

  events.forEach((event, index) => {
    const source = event.source;
    const eventType = event.sourceEventType;
    const time = formatTimestamp(event.eventTime);
    const details = formatEventDetails(event);
    lines.push(`${index + 1}. [${source}.${eventType}] ${time} - ${details}`);
  });

  return lines.join("\n");
}

export function formatWorkUnitsForSummary(
  workUnits: WorkUnit[],
  scopeType: "user" | "project",
  scopeId: string,
  date: string,
): string {
  const datePart = new Date(date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const displayDate = `${months[datePart.getUTCMonth()]} ${datePart.getUTCDate()}, ${datePart.getUTCFullYear()}`;

  if (workUnits.length === 0) {
    return `## Daily Summary for ${scopeType}:${scopeId} on ${displayDate}\n\nNo work was recorded for this ${scopeType}.`;
  }

  const totalMinutes = workUnits.reduce((sum, wu) => sum + wu.estimatedMinutes, 0);

  const lines: string[] = [];
  lines.push(`## Daily Summary for ${scopeType}:${scopeId} on ${displayDate}`);
  lines.push("");
  lines.push(`### Work Units: ${workUnits.length} total (estimated ${totalMinutes} minutes)`);
  lines.push("");

  workUnits.forEach((wu, index) => {
    const confidence = wu.confidence.toFixed(2);
    const minutes = wu.estimatedMinutes;
    lines.push(`${index + 1}. **${wu.title}** (${minutes} min, confidence: ${confidence})`);
    lines.push(`   Summary: ${wu.summary}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}
