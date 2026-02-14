import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractProjectFromScrum } from "@/lib/ai/extract";

export async function POST(request: Request) {
  const body = await request.json();
  const { transcript, participants } = body;

  if (!transcript) {
    return NextResponse.json(
      { error: "transcript is required" },
      { status: 400 }
    );
  }

  const extraction = await extractProjectFromScrum(
    transcript,
    participants || []
  );

  if (!extraction.shouldCreateProject) {
    return NextResponse.json({
      shouldCreateProject: false,
      message: "No new project detected in the transcript.",
    });
  }

  // Look up developers by name to resolve assignee IDs
  const allDevs = await prisma.developer.findMany({
    select: { id: true, name: true },
  });
  const devNameMap = new Map(
    allDevs.map((d) => [d.name.toLowerCase(), d.id])
  );

  // Create the project
  const project = await prisma.project.create({
    data: {
      name: extraction.projectName,
      description: extraction.projectDescription,
      status: "active",
      targetDate: extraction.targetDate
        ? new Date(extraction.targetDate)
        : undefined,
    },
  });

  // Create tasks
  let taskCount = 0;
  for (const task of extraction.proposedTasks) {
    // Try to match assignee name to a developer
    const assigneeId =
      devNameMap.get(task.assignee.toLowerCase()) || null;

    await prisma.task.create({
      data: {
        name: task.name,
        description: task.description,
        projectId: project.id,
        assigneeId,
        priority: task.priority,
        duration: task.estimatedDays,
        status: "not_started",
      },
    });
    taskCount++;
  }

  return NextResponse.json(
    {
      shouldCreateProject: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        targetDate: project.targetDate,
      },
      taskCount,
    },
    { status: 201 }
  );
}
