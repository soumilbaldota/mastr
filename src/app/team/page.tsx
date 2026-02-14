import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const organization = await prisma.organization.findFirst({
    include: {
      teams: {
        include: {
          developers: {
            include: {
              assignedTasks: true,
              checkIns: {
                orderBy: { date: "desc" },
                take: 1,
              },
              reportedBlockers: {
                where: { status: { not: "resolved" } },
              },
            },
          },
        },
      },
    },
  });

  if (!organization) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">Team</h1>
        <p className="text-muted-foreground mt-4">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{organization.name}</h1>
        <p className="text-muted-foreground mt-1">
          Team structure and developer workload
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {organization.teams.map((team) => (
          <Card key={team.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {team.name}
              </CardTitle>
              {team.discordChannel && (
                <p className="text-xs text-muted-foreground">
                  Discord: #{team.discordChannel}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {team.developers.map((dev) => {
                  const totalTasks = dev.assignedTasks.length;
                  const completedTasks = dev.assignedTasks.filter(
                    (t) => t.status === "completed"
                  ).length;
                  const progress =
                    totalTasks > 0
                      ? Math.round((completedTasks / totalTasks) * 100)
                      : 0;
                  const lastCheckIn = dev.checkIns[0];

                  return (
                    <div key={dev.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {dev.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{dev.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {dev.role}
                            </p>
                          </div>
                        </div>
                        {dev.reportedBlockers.length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {dev.reportedBlockers.length} blocker
                            {dev.reportedBlockers.length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">
                            Tasks: {completedTasks}/{totalTasks}
                          </span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>

                      {lastCheckIn && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Last check-in:{" "}
                          {new Date(lastCheckIn.date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
