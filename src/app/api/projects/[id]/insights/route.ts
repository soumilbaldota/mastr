import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateCPM, analyzeResourceAllocation } from "@/lib/cpm/algorithm";
import type { CPMInput } from "@/lib/cpm/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          assignee: true,
          dependsOn: true,
          blockers: { where: { status: { not: "resolved" } } },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Get recent check-ins
  const recentCheckIns = await prisma.checkIn.findMany({
    where: {
      developer: {
        assignedTasks: { some: { projectId: id } },
      },
    },
    include: { developer: true, items: true },
    orderBy: { date: "desc" },
    take: 10,
  });

  // Get open blockers
  const openBlockers = await prisma.blocker.findMany({
    where: {
      task: { projectId: id },
      status: { not: "resolved" },
    },
    include: {
      task: true,
      reportedBy: true,
      assignedTo: true,
    },
  });

  // Run CPM analysis
  const cpmInput: CPMInput[] = project.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    duration: task.duration,
    dependencies: task.dependsOn.map((d) => d.dependencyId),
    status: task.status,
    progress: task.progress,
    assigneeId: task.assigneeId || undefined,
    assigneeName: task.assignee?.name || undefined,
  }));

  const cpmResult = calculateCPM(cpmInput);
  const resourceAnalysis = analyzeResourceAllocation(cpmResult);

  // Calculate metrics
  const totalTasks = project.tasks.length;
  const completedTasks = project.tasks.filter(
    (t) => t.status === "completed"
  ).length;
  const blockedTasks = project.tasks.filter(
    (t) => t.status === "blocked"
  ).length;
  const completionPercentage = Math.round((completedTasks / totalTasks) * 100);

  const startDate = project.startDate;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + cpmResult.projectDuration);

  // Determine health
  let projectHealth: "on_track" | "at_risk" | "behind" = "on_track";
  if (openBlockers.length > 2 || blockedTasks > 2) {
    projectHealth = "behind";
  } else if (openBlockers.length > 0 || blockedTasks > 0) {
    projectHealth = "at_risk";
  }
  if (project.targetDate && endDate > project.targetDate) {
    projectHealth = "behind";
  }

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      startDate: startDate.toISOString(),
      targetDate: project.targetDate?.toISOString(),
      estimatedEndDate: endDate.toISOString(),
    },
    health: projectHealth,
    metrics: {
      totalTasks,
      completedTasks,
      blockedTasks,
      inProgressTasks: project.tasks.filter((t) => t.status === "in_progress")
        .length,
      completionPercentage,
      criticalPathLength: cpmResult.projectDuration,
      criticalTaskCount: cpmResult.criticalPath.length,
    },
    blockers: openBlockers.map((b) => ({
      id: b.id,
      description: b.description,
      priority: b.priority,
      taskName: b.task?.name,
      reportedBy: b.reportedBy.name,
      assignedTo: b.assignedTo?.name,
      createdAt: b.createdAt.toISOString(),
    })),
    recentCheckIns: recentCheckIns.map((c) => ({
      id: c.id,
      developer: c.developer.name,
      date: c.date.toISOString(),
      summary: c.summary,
      mood: c.mood,
    })),
    resourceAnalysis,
    cpmResult,
  });
}
