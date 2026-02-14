import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const developers = await prisma.developer.findMany({
    include: {
      team: { include: { organization: true } },
      assignedTasks: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(developers);
}
