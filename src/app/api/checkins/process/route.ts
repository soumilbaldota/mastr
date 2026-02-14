import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractCheckInData, routeBlocker } from "@/lib/ai/extract";
import { sendBlockerNotification } from "@/lib/discord/notifications";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type ResolvedBlocker = {
  blockerId: string | null;
  description: string;
  person: string | null;
  taskName: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function scoreResolvedCandidate(
  resolved: ResolvedBlocker,
  candidate: {
    description: string;
    reportedBy: { name: string };
    assignedTo: { name: string } | null;
    task: { name: string } | null;
  }
): number {
  const person = normalizeText(resolved.person);
  const taskName = normalizeText(resolved.taskName);
  const description = normalizeText(resolved.description);
  const candidateDescription = normalizeText(candidate.description);

  let score = 0;

  if (person) {
    const reportedBy = normalizeText(candidate.reportedBy.name);
    const assignedTo = normalizeText(candidate.assignedTo?.name);
    if (reportedBy.includes(person) || assignedTo.includes(person)) {
      score += 3;
    }
  }

  if (taskName && candidate.task?.name) {
    const candidateTask = normalizeText(candidate.task.name);
    if (candidateTask.includes(taskName) || taskName.includes(candidateTask)) {
      score += 2;
    }
  }

  if (description.length >= 6) {
    if (
      candidateDescription.includes(description) ||
      description.includes(candidateDescription)
    ) {
      score += 2;
    }
  }

  return score;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { checkInId } = body;

  const checkIn = await prisma.checkIn.findUnique({
    where: { id: checkInId },
    include: {
      developer: {
        include: {
          assignedTasks: true,
        },
      },
    },
  });

  if (!checkIn || !checkIn.transcript) {
    return NextResponse.json(
      { error: "Check-in not found or has no transcript" },
      { status: 404 }
    );
  }

  // Fetch open blockers for this developer
  const openBlockers = await prisma.blocker.findMany({
    where: {
      reportedById: checkIn.developerId,
      status: "open",
    },
    select: {
      id: true,
      description: true,
      priority: true,
    },
  });

  const extraction = await extractCheckInData(
    checkIn.transcript,
    checkIn.developer.name,
    checkIn.developer.assignedTasks.map((t) => ({
      id: t.id,
      name: t.name,
    })),
    openBlockers
  );

  // Update check-in with extracted data
  await prisma.checkIn.update({
    where: { id: checkInId },
    data: {
      summary: extraction.summary,
      mood: extraction.mood,
      aiNotes: JSON.stringify(extraction.suggestions),
    },
  });

  // Create check-in items for tasks worked on
  for (const task of extraction.tasksWorkedOn) {
    await prisma.checkInItem.create({
      data: {
        checkInId,
        type: "progress",
        content: task.taskName,
        taskId: task.taskId,
        progress: task.progress,
      },
    });

    // Update task progress if we have a taskId
    if (task.taskId) {
      await prisma.task.update({
        where: { id: task.taskId },
        data: { progress: task.progress },
      });
    }
  }

  // Resolve blockers mentioned as cleared
  if (extraction.resolvedBlockers.length > 0) {
    const allOpenBlockers = await prisma.blocker.findMany({
      where: { status: "open" },
      include: {
        reportedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
        task: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const remaining = [...allOpenBlockers];
    const resolvedIds = new Set<string>();

    for (const resolved of extraction.resolvedBlockers as ResolvedBlocker[]) {
      let matchedBlockerId: string | null = null;

      // Priority 1: Use explicit blocker ID if provided
      if (resolved.blockerId) {
        const exactMatch = remaining.find((b) => b.id === resolved.blockerId);
        if (exactMatch) {
          matchedBlockerId = exactMatch.id;
          const idx = remaining.findIndex((b) => b.id === exactMatch.id);
          if (idx >= 0) remaining.splice(idx, 1);
        }
      }

      // Priority 2: Fallback to fuzzy matching if no explicit ID
      if (!matchedBlockerId) {
        let bestIndex = -1;
        let bestScore = 0;

        for (let i = 0; i < remaining.length; i++) {
          const candidate = remaining[i];
          const score = scoreResolvedCandidate(resolved, candidate);
          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }

        // Only match if score is high enough (at least 2 points)
        if (bestIndex >= 0 && bestScore >= 2) {
          const matched = remaining.splice(bestIndex, 1)[0];
          matchedBlockerId = matched.id;
        }
      }

      // Update blocker as resolved if we found a match
      if (matchedBlockerId) {
        resolvedIds.add(matchedBlockerId);

        await prisma.blocker.update({
          where: { id: matchedBlockerId },
          data: {
            status: "resolved",
            resolvedAt: new Date(),
          },
        });

        await prisma.checkInItem.create({
          data: {
            checkInId,
            type: "resolved_blocker",
            content: resolved.description,
          },
        });
      }
    }

    console.log(
      `Resolved ${resolvedIds.size} blocker(s) from check-in ${checkInId}`
    );
  }

  // Create blockers and route them
  const blockerCreated: { id: string; description: string }[] = [];

  for (const blocker of extraction.blockers) {
    await prisma.checkInItem.create({
      data: {
        checkInId,
        type: "blocker",
        content: blocker.description,
      },
    });

    // Create a formal blocker record
    const created = await prisma.blocker.create({
      data: {
        reportedById: checkIn.developerId,
        description: blocker.description,
        priority: blocker.severity,
        status: "open",
      },
    });

    blockerCreated.push({ id: created.id, description: blocker.description });
  }

  // Route blockers: fetch org structure, run AI routing, send notifications
  if (blockerCreated.length > 0) {
    try {
      // Fetch org structure for routing
      const teams = await prisma.team.findMany({
        include: {
          developers: {
            select: { id: true, name: true, role: true, discordUserId: true },
          },
        },
      });

      const orgStructure = {
        teams: teams.map((t) => ({
          name: t.name,
          members: t.developers.map((d) => ({
            id: d.id,
            name: d.name,
            role: d.role,
          })),
        })),
      };

      // Build a lookup of developer name -> discordUserId
      const discordUserMap = new Map<string, string>();
      for (const team of teams) {
        for (const dev of team.developers) {
          if (dev.discordUserId) {
            discordUserMap.set(dev.name, dev.discordUserId);
            discordUserMap.set(dev.id, dev.discordUserId);
          }
        }
      }

      for (const blocker of blockerCreated) {
        try {
          const routing = await routeBlocker(blocker.description, orgStructure);

          // Find Discord user IDs for target persons
          for (const person of routing.targetPersons) {
            const discordUserId =
              discordUserMap.get(person) || discordUserMap.get(person);

            await sendBlockerNotification({
              blockerDescription: blocker.description,
              reportedBy: checkIn.developer.name,
              taskName: routing.targetTeam,
              priority: routing.urgency,
              targetPersonName: person,
              targetDiscordUserId: discordUserId,
              appUrl: APP_URL,
            });
          }
        } catch (routeErr) {
          console.error(
            `Failed to route blocker "${blocker.description}":`,
            routeErr
          );
        }
      }
    } catch (err) {
      console.error("Failed to route blockers:", err);
    }
  }

  return NextResponse.json({
    extraction,
    message: "Check-in processed successfully",
  });
}
