import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { calculateCPM, analyzeResourceAllocation } from "@/lib/cpm/algorithm";
import type { CPMInput } from "@/lib/cpm/types";
import Link from "next/link";
import {
  FolderKanban,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  Mic,
  TrendingUp,
  Activity,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch all data in parallel
  const [projects, developers, recentCheckIns, allBlockers] = await Promise.all([
    prisma.project.findMany({
      where: { status: "active" },
      include: {
        tasks: {
          include: {
            assignee: true,
            dependsOn: true,
            blockers: { where: { status: { not: "resolved" } } },
          },
        },
      },
    }),
    prisma.developer.findMany({
      include: { team: true, assignedTasks: true },
    }),
    prisma.checkIn.findMany({
      include: { developer: true },
      orderBy: { date: "desc" },
      take: 10,
    }),
    prisma.blocker.findMany({
      where: { status: { not: "resolved" } },
      include: {
        task: { include: { project: true } },
        reportedBy: true,
        assignedTo: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Calculate overall metrics
  const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = projects.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "completed").length,
    0
  );
  const overallProgress =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const criticalBlockers = allBlockers.filter(
    (b) => b.priority === "critical"
  ).length;

  // Mood distribution
  const moodCounts = recentCheckIns.reduce(
    (acc, c) => {
      const mood = c.mood || "neutral";
      acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate project insights
  const projectInsights = projects.map((project) => {
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

    const completed = project.tasks.filter(
      (t) => t.status === "completed"
    ).length;
    const totalBlockers = project.tasks.reduce(
      (sum, t) => sum + t.blockers.length,
      0
    );
    const progress =
      project.tasks.length > 0
        ? Math.round((completed / project.tasks.length) * 100)
        : 0;

    const endDate = new Date(project.startDate);
    endDate.setDate(endDate.getDate() + cpmResult.projectDuration);

    let health: "on_track" | "at_risk" | "behind" = "on_track";
    if (totalBlockers > 2) health = "behind";
    else if (totalBlockers > 0 || progress < 50) health = "at_risk";
    if (project.targetDate && endDate > project.targetDate) health = "behind";

    return {
      project,
      cpmResult,
      resourceAnalysis,
      progress,
      completed,
      totalBlockers,
      endDate,
      health,
    };
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your projects, team, and activity
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground">
              {projectInsights.filter((p) => p.health === "on_track").length} on
              track
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Progress</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallProgress}%</div>
            <Progress value={overallProgress} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Blockers</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {allBlockers.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {criticalBlockers} critical
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{developers.length}</div>
            <div className="flex gap-1 flex-wrap mt-1">
              {Object.entries(moodCounts).slice(0, 3).map(([mood, count]) => (
                <Badge key={mood} variant="outline" className="text-xs">
                  {mood}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active Projects</CardTitle>
            <Link href="/projects">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {projectInsights.map(
              ({ project, progress, completed, totalBlockers, health }) => (
                <Collapsible key={project.id}>
                  <div className="rounded-lg border hover:border-primary/50 transition-colors">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-4 p-4">
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{project.name}</h3>
                            <Badge
                              variant={
                                health === "on_track"
                                  ? "default"
                                  : health === "at_risk"
                                    ? "secondary"
                                    : "destructive"
                              }
                            >
                              {health === "on_track"
                                ? "On Track"
                                : health === "at_risk"
                                  ? "At Risk"
                                  : "Behind"}
                            </Badge>
                            {totalBlockers > 0 && (
                              <Badge variant="outline" className="text-red-600">
                                {totalBlockers} blocker(s)
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {completed}/{project.tasks.length} tasks completed
                          </p>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <div className="text-2xl font-bold">{progress}%</div>
                          <Progress value={progress} className="mt-1 w-20" />
                        </div>
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t p-4 space-y-4 bg-muted/30">
                        {/* CPM Insights */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                              <Clock className="h-4 w-4" /> Duration
                            </h4>
                            <div className="text-xl font-bold">
                              {projectInsights.find(
                                (p) => p.project.id === project.id
                              )?.cpmResult.projectDuration}
                              d
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Estimated timeline
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                              <TrendingUp className="h-4 w-4" /> Critical Path
                            </h4>
                            <div className="text-xl font-bold text-amber-600">
                              {
                                projectInsights.find(
                                  (p) => p.project.id === project.id
                                )?.cpmResult.criticalPath.length
                              }{" "}
                              tasks
                            </div>
                            <p className="text-xs text-muted-foreground">
                              No slack time
                            </p>
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" /> Risk
                            </h4>
                            <div
                              className={`text-xl font-bold ${totalBlockers > 0 ? "text-red-600" : "text-green-600"}`}
                            >
                              {totalBlockers > 0 ? "High" : "Low"}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {totalBlockers} active blocker(s)
                            </p>
                          </div>
                        </div>

                        {/* Resource Recommendations */}
                        {projectInsights.find((p) => p.project.id === project.id)
                          ?.resourceAnalysis.recommendations.length! > 0 && (
                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 p-3">
                            <h4 className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-1">
                              <Users className="h-4 w-4" /> Recommendations
                            </h4>
                            <ul className="space-y-1">
                              {projectInsights
                                .find((p) => p.project.id === project.id)
                                ?.resourceAnalysis.recommendations.map(
                                  (rec, i) => (
                                    <li
                                      key={i}
                                      className="text-xs text-amber-700 dark:text-amber-300"
                                    >
                                      • {rec}
                                    </li>
                                  )
                                )}
                            </ul>
                          </div>
                        )}

                        <Link href={`/projects/${project.id}`}>
                          <Button variant="outline" size="sm" className="gap-2">
                            <BarChart3 className="h-4 w-4" />
                            View Project Details
                          </Button>
                        </Link>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity & Blockers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Check-ins */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Recent Check-ins
              </CardTitle>
              <Link href="/checkin">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentCheckIns.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
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

        {/* Active Blockers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Active Blockers
              </CardTitle>
              <Link href="/blockers">
                <Button variant="ghost" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {allBlockers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">
                No active blockers
              </p>
            ) : (
              <div className="space-y-3">
                {allBlockers.slice(0, 5).map((blocker) => (
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
                        {blocker.task?.name} • {blocker.reportedBy.name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
