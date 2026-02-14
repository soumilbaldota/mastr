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
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

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

  // Calculate estimated end date
  const startDate = project.startDate;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + cpmResult.projectDuration);

  return NextResponse.json({
    ...cpmResult,
    projectName: project.name,
    startDate: startDate.toISOString(),
    estimatedEndDate: endDate.toISOString(),
    targetDate: project.targetDate?.toISOString(),
    resourceAnalysis,
  });
}
