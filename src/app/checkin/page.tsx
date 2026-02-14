import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VoiceCheckin } from "@/components/voice-checkin";
import { CheckinDeveloperSelect } from "@/components/checkin-developer-select";
import { Clock, MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const developers = await prisma.developer.findMany({
    include: { team: true },
    orderBy: { name: "asc" },
  });

  const recentCheckIns = await prisma.checkIn.findMany({
    include: {
      developer: true,
      items: { include: { task: true } },
    },
    orderBy: { date: "desc" },
    take: 10,
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Daily Check-in</h1>
        <p className="text-muted-foreground mt-1">
          Recently Checked-In developers
        </p>
      </div>

      {/* Recent Check-ins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Recent Check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentCheckIns.map((checkIn) => (
              <div key={checkIn.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {checkIn.developer.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <span className="font-medium">
                      {checkIn.developer.name}
                    </span>
                    {checkIn.mood && (
                      <Badge variant="outline" className="text-xs">
                        {checkIn.mood}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(checkIn.date).toLocaleString()}
                  </div>
                </div>
                {checkIn.summary && (
                  <p className="text-sm text-muted-foreground">
                    {checkIn.summary}
                  </p>
                )}
                {checkIn.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {checkIn.items.map((item) => (
                      <Badge
                        key={item.id}
                        variant={
                          item.type === "blocker" ? "destructive" : "secondary"
                        }
                        className="text-xs"
                      >
                        {item.type}: {item.content.slice(0, 40)}
                        {item.content.length > 40 ? "..." : ""}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
