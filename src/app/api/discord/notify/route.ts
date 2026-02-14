import { NextResponse } from "next/server";

// This endpoint receives notification requests from the app
// and forwards them to Discord via the bot
// The Discord bot polls this or we use a shared queue

// In-memory queue for notifications (in production, use Redis or a database)
const notificationQueue: Array<{
  id: string;
  channelId?: string;
  userId?: string;
  targetPersonName?: string;
  embed: Record<string, unknown>;
  createdAt: Date;
}> = [];

export async function POST(request: Request) {
  const body = await request.json();

  const notification = {
    id: crypto.randomUUID(),
    channelId: body.channelId,
    userId: body.userId,
    targetPersonName: body.targetPersonName,
    embed: body.embed,
    createdAt: new Date(),
  };

  notificationQueue.push(notification);

  return NextResponse.json({
    success: true,
    notificationId: notification.id,
  });
}

// Discord bot polls this endpoint to get pending notifications
export async function GET() {
  const pending = [...notificationQueue];
  notificationQueue.length = 0; // Clear queue

  return NextResponse.json(pending);
}
