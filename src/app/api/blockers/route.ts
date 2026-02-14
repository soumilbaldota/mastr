import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");

  const blockers = await prisma.blocker.findMany({
    where: {
      ...(status ? { status } : { status: { not: "resolved" } }),
      ...(projectId ? { task: { projectId } } : {}),
    },
    include: {
      task: { include: { project: true } },
      reportedBy: { include: { team: true } },
      assignedTo: { include: { team: true } },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(blockers);
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, status, assignedToId } = body;

  const blocker = await prisma.blocker.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
    },
    include: {
      task: true,
      reportedBy: true,
      assignedTo: true,
    },
  });

  return NextResponse.json(blocker);
}
