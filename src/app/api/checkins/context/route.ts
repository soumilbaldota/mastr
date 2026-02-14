import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const developerId = searchParams.get("developerId");

  if (!developerId) {
    return NextResponse.json(
      { error: "developerId query parameter is required" },
      { status: 400 }
    );
  }

  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    include: {
      team: true,
      assignedTasks: {
        include: {
          project: true,
          blockers: { where: { status: "open" } },
        },
      },
      checkIns: {
        orderBy: { date: "desc" },
        take: 3,
        select: {
          date: true,
          summary: true,
          mood: true,
        },
      },
    },
  });

  if (!developer) {
    return NextResponse.json(
      { error: "Developer not found" },
      { status: 404 }
    );
  }

  // Get open blockers reported by this developer
  const openBlockers = await prisma.blocker.findMany({
    where: {
      reportedById: developerId,
      status: "open",
    },
    include: {
      task: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get project health for projects this developer works on
  const projectIds = [
    ...new Set(developer.assignedTasks.map((t) => t.projectId)),
  ];
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: {
      tasks: { select: { status: true, progress: true } },
    },
  });

  const projectHealth = projects.map((p) => {
    const total = p.tasks.length;
    const completed = p.tasks.filter((t) => t.status === "completed").length;
    const avgProgress =
      total > 0
        ? Math.round(p.tasks.reduce((s, t) => s + t.progress, 0) / total)
        : 0;
    return {
      name: p.name,
      status: p.status,
      completion: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgProgress,
    };
  });

  return NextResponse.json({
    developer: {
      id: developer.id,
      name: developer.name,
      role: developer.role,
      team: developer.team.name,
    },
    assignedTasks: developer.assignedTasks.map((t) => ({
      id: t.id,
      name: t.name,
      project: t.project.name,
      status: t.status,
      progress: t.progress,
      priority: t.priority,
      blockerCount: t.blockers.length,
    })),
    recentCheckIns: developer.checkIns,
    openBlockers: openBlockers.map((b) => ({
      id: b.id,
      description: b.description,
      task: b.task?.name ?? null,
      priority: b.priority,
    })),
    projectHealth,
  });
}
