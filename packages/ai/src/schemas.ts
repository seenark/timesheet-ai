import { z } from "zod";

export const WorkUnitOutputSchema = z.object({
  title: z.string().describe("A concise title for this work unit (e.g., 'Implemented user authentication')"),
  summary: z.string().describe("A brief paragraph describing what was accomplished"),
  estimatedMinutes: z.number().int().min(1).max(480).describe("Estimated time spent in minutes"),
  confidence: z.number().min(0).max(1).describe("Confidence in the accuracy of this work unit (0-1)"),
}).strict();

export type WorkUnitOutput = z.infer<typeof WorkUnitOutputSchema>;

export const DailySummaryOutputSchema = z.object({
  summary: z.string().describe("A coherent paragraph summarizing the day's work suitable for timesheet reporting"),
}).strict();

export type DailySummaryOutput = z.infer<typeof DailySummaryOutputSchema>;

export const WORK_UNIT_SCHEMA = WorkUnitOutputSchema;
export const DAILY_SUMMARY_SCHEMA = DailySummaryOutputSchema;
