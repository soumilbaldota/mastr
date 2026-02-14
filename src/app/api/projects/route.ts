import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const projects = await prisma.project.findMany({
    include: {
      tasks: {
        include: {
          assignee: true,
          dependsOn: true,
          blockers: { where: { status: "open" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();

  const project = await prisma.project.create({
    data: {
      name: body.name,
      description: body.description,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
