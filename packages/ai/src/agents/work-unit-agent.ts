import { Agent } from "@mastra/core/agent";
import type { ActivityCluster, NormalizedEvent } from "@timesheet-ai/domain";
import { formatEventsForWorkUnit } from "../prompts";
import { type WorkUnitOutput, WorkUnitOutputSchema } from "../schemas";

const MODEL = process.env.AI_MODEL ?? "zai-coding-plan/glm-4.7";

const FALLBACK_WORK_UNIT: WorkUnitOutput = {
  title: "Activity recorded",
  summary: "Developer activity was recorded. Details pending review.",
  estimatedMinutes: 30,
  confidence: 0.3,
};

export const workUnitAgent = new Agent({
  name: "Work Unit Generator",
  instructions: `You are an expert project analyst specializing in developer productivity and timesheet generation.

Given a cluster of developer activity events (commits, issue updates, messages, etc.), your task is to produce a concise, accurate work unit that could appear on a timesheet.

## Your Output
Return a JSON object with:
- **title**: A concise, professional work unit title (e.g., "Implemented user authentication" or "Fixed login redirect bug"). Use imperative mood or past tense. Max 80 characters.
- **summary**: A brief paragraph (2-4 sentences) describing what was accomplished. Be specific — mention what was built, fixed, or changed.
- **estimatedMinutes**: A reasonable time estimate in minutes (1-480). Consider the number of events and complexity.
- **confidence**: Your confidence in the accuracy of this work unit (0.0-1.0). Higher confidence = more evidence and clear activity. Lower = ambiguous or mixed activity.

## Guidelines
- Base your assessment on ALL provided events
- If events are about different topics, still produce ONE work unit for the cluster (clusters are already topic-grouped)
- For git commits: assess the overall theme of changes
- For issue updates: focus on what was done (status changes, comments, etc.)
- For Discord messages: note discussions, decisions, or coordination work
- Be conservative with time estimates — a few commits is typically 30-60 minutes
- Set confidence based on evidence clarity (high = clear commits/messages, low = sparse or ambiguous)`,
  // biome-ignore lint/suspicious/noExplicitAny: Mastra runtime accepts provider/model string identifiers
  model: MODEL as any,
});

export const generateWorkUnit = async (
  cluster: ActivityCluster,
  events: NormalizedEvent[]
): Promise<WorkUnitOutput> => {
  const context = formatEventsForWorkUnit(cluster, events);

  try {
    const response = await workUnitAgent.generate(context, {
      output: WorkUnitOutputSchema,
    });

    return response.object;
  } catch {
    return FALLBACK_WORK_UNIT;
  }
};
