import { generateObject } from "ai";
import { z } from "zod";
import {
  TRANSCRIPT_EXTRACTION_PROMPT,
  BLOCKER_ROUTING_PROMPT,
  PROJECT_CREATION_PROMPT,
} from "./prompts";
import { getModel } from "./provider";

const checkInExtractionSchema = z.object({
  tasksWorkedOn: z.array(
    z.object({
      taskName: z.string(),
      progress: z.number().min(0).max(100),
      taskId: z.string().nullable(),
    })
  ),
  blockers: z.array(
    z.object({
      description: z.string(),
      blockingTeam: z.string().nullable(),
      severity: z.enum(["medium", "high", "critical"]),
    })
  ),
  resolvedBlockers: z
    .array(
      z.object({
        blockerId: z.string().nullable(),
        description: z.string(),
        person: z.string().nullable(),
        taskName: z.string().nullable(),
      })
    )
    .default([]),
  mood: z.enum(["positive", "neutral", "frustrated", "blocked"]),
  summary: z.string(),
  suggestions: z.array(z.string()),
});

export type CheckInExtraction = z.infer<typeof checkInExtractionSchema>;

export async function extractCheckInData(
  transcript: string,
  developerName: string,
  assignedTasks: { id: string; name: string }[],
  openBlockers: { id: string; description: string; priority: string }[] = []
): Promise<CheckInExtraction> {
  const context = `Developer: ${developerName}

Assigned Tasks: ${assignedTasks.map((t) => `${t.id}: ${t.name}`).join(", ")}

Open Blockers: ${openBlockers.length > 0 ? openBlockers.map((b) => `Blocker ID: ${b.id} | Description: ${b.description} | Priority: ${b.priority}`).join("\n") : "None"}

Transcript:
${transcript}`;

  const { object } = await generateObject({
    model: getModel(),
    schema: checkInExtractionSchema,
    system: TRANSCRIPT_EXTRACTION_PROMPT,
    prompt: context,
  });

  return object;
}

const blockerRoutingSchema = z.object({
  targetTeam: z.string(),
  targetPersons: z.array(z.string()),
  urgency: z.enum(["medium", "high", "critical"]),
  message: z.string(),
});

export type BlockerRouting = z.infer<typeof blockerRoutingSchema>;

export async function routeBlocker(
  blockerDescription: string,
  orgStructure: {
    teams: { name: string; members: { id: string; name: string; role: string }[] }[];
  }
): Promise<BlockerRouting> {
  const context = `Blocker: ${blockerDescription}\n\nOrganization Structure:\n${JSON.stringify(orgStructure, null, 2)}`;

  const { object } = await generateObject({
    model: getModel(),
    schema: blockerRoutingSchema,
    system: BLOCKER_ROUTING_PROMPT,
    prompt: context,
  });

  return object;
}

// ---------- Project creation from scrum transcripts ----------

const scrumProjectSchema = z.object({
  shouldCreateProject: z.boolean(),
  projectName: z.string(),
  projectDescription: z.string(),
  proposedTasks: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      assignee: z.string(),
      priority: z.enum(["low", "medium", "high", "critical"]),
      estimatedDays: z.number(),
    })
  ),
  targetDate: z.string().nullable(),
});

export type ScrumProjectExtraction = z.infer<typeof scrumProjectSchema>;

export async function extractProjectFromScrum(
  transcript: string,
  participants: string[]
): Promise<ScrumProjectExtraction> {
  const context = `Participants: ${participants.join(", ")}\n\nTranscript:\n${transcript}`;

  const { object } = await generateObject({
    model: getModel(),
    schema: scrumProjectSchema,
    system: PROJECT_CREATION_PROMPT,
    prompt: context,
  });

  return object;
}
