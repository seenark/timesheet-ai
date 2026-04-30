import { Agent } from "@mastra/core/agent";
import type { WorkUnit } from "@timesheet-ai/domain";
import { formatWorkUnitsForSummary } from "../prompts";
import { type DailySummaryOutput, DailySummaryOutputSchema } from "../schemas";

const MODEL = process.env.AI_MODEL ?? "zai-coding-plan/glm-4.7";

export const dailySummaryAgent = new Agent({
  name: "Daily Summary Generator",
  instructions: `You are an expert timesheet summarizer.

Given a list of work units for a single scope (either a user or a project) on a given date, produce a coherent daily summary suitable for timesheet reporting.

## Your Output
Return a JSON object with:
- **summary**: A coherent paragraph (3-5 sentences) summarizing the day's work. This should read like a professional timesheet entry — clear, concise, and focused on outcomes rather than activities.

## Guidelines
- Synthesize multiple work units into a cohesive narrative
- Group related work together naturally
- Use professional, past-tense language
- Focus on what was accomplished, not just what was done
- If work units have low confidence, note that some items may need review
- Don't just list titles — weave them into a narrative
- If no work units exist (or all have very low confidence), acknowledge that in the summary

## Examples
Good: "Completed implementation of user authentication including JWT-based login/logout, middleware integration, and password reset flow. Also addressed bug in session handling and updated related tests."
Bad: "Worked on authentication. Fixed a bug. Updated tests."`,
  // biome-ignore lint/suspicious/noExplicitAny: Mastra runtime accepts provider/model string identifiers
  model: MODEL as any,
});

export const generateDailySummary = async (
  workUnits: WorkUnit[],
  scopeType: "user" | "project",
  scopeId: string,
  date: string
): Promise<DailySummaryOutput> => {
  if (workUnits.length === 0) {
    return {
      summary: "No recorded work activities for this period.",
    };
  }

  const context = formatWorkUnitsForSummary(
    workUnits,
    scopeType,
    scopeId,
    date
  );

  try {
    const response = await dailySummaryAgent.generate(context, {
      output: DailySummaryOutputSchema,
    });

    return response.object as DailySummaryOutput;
  } catch {
    return {
      summary:
        "Work was recorded but summary generation failed. Please review individual work units.",
    };
  }
};
