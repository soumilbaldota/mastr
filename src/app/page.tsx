import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  FolderKanban,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  Mic,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, blockers, developers, recentCheckIns] = await Promise.all([
    prisma.project.findMany({ include: { tasks: true } }),
    prisma.blocker.findMany({
      where: { status: { not: "resolved" } },
      include: { task: true, reportedBy: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.developer.findMany({ include: { team: true, assignedTasks: true } }),
    prisma.checkIn.findMany({
      include: { developer: true },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = projects.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "completed").length,
    0
  );
  const overallProgress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your projects and team activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground">
              {projects.filter((p) => p.status === "active").length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Overall Progress
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallProgress}%</div>
            <Progress value={overallProgress} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Blockers
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {blockers.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {blockers.filter((b) => b.priority === "critical").length}{" "}
              critical
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{developers.length}</div>
            <p className="text-xs text-muted-foreground">
              across {new Set(developers.map((d) => d.teamId)).size} teams
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Active Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {blockers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No active blockers
              </p>
            ) : (
              <div className="space-y-3">
                {blockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Badge
                      variant={
                        blocker.priority === "critical"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {blocker.priority}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {blocker.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {blocker.task?.name} &middot; Reported by{" "}
                        {blocker.reportedBy.name}
                      </p>
                    </div>
                  </div>
                ))}
                <Link
                  href="/blockers"
                  className="text-sm text-primary hover:underline block text-center pt-2"
                >
                  View all blockers
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Recent Check-ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCheckIns.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No check-ins yet
              </p>
            ) : (
              <div className="space-y-3">
                {recentCheckIns.map((checkIn) => (
                  <div
                    key={checkIn.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {checkIn.developer.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {checkIn.developer.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {checkIn.summary || "Check-in recorded"}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(checkIn.date).toLocaleDateString()}
                        </span>
                        {checkIn.mood && (
                          <Badge variant="outline" className="text-xs">
                            {checkIn.mood}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projects.map((project) => {
              const completed = project.tasks.filter(
                (t) => t.status === "completed"
              ).length;
              const progress =
                project.tasks.length > 0
                  ? Math.round((completed / project.tasks.length) * 100)
                  : 0;
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block"
                >
                  <div className="flex items-center gap-4 rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{project.name}</h3>
                        <Badge variant="outline">{project.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {project.description}
                      </p>
                    </div>
                    <div className="text-right min-w-[120px]">
                      <div className="text-sm font-medium">{progress}%</div>
                      <Progress value={progress} className="mt-1 w-24" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {completed}/{project.tasks.length} tasks
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
