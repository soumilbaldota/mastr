import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const developerId = searchParams.get("developerId");

  const checkins = await prisma.checkIn.findMany({
    where: developerId ? { developerId } : undefined,
    include: {
      developer: true,
      items: { include: { task: true } },
    },
    orderBy: { date: "desc" },
    take: 20,
  });

  return NextResponse.json(checkins);
}

export async function POST(request: Request) {
  const body = await request.json();

  const checkin = await prisma.checkIn.create({
    data: {
      developerId: body.developerId,
      transcript: body.transcript,
      summary: body.summary,
      mood: body.mood,
      aiNotes: body.aiNotes,
      items: body.items
        ? {
            create: body.items.map(
              (item: {
                type: string;
                content: string;
                taskId?: string;
                progress?: number;
              }) => ({
                type: item.type,
                content: item.content,
                taskId: item.taskId,
                progress: item.progress,
              })
            ),
          }
        : undefined,
    },
    include: {
      developer: true,
      items: true,
    },
  });

  return NextResponse.json(checkin, { status: 201 });
}
