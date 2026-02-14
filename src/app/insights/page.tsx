import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateCPM, analyzeResourceAllocation } from "@/lib/cpm/algorithm";
import type { CPMInput } from "@/lib/cpm/types";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  Activity,
  Target,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const projects = await prisma.project.findMany({
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
  });

  const recentCheckIns = await prisma.checkIn.findMany({
    include: { developer: true, items: true },
    orderBy: { date: "desc" },
    take: 15,
  });

  const allBlockers = await prisma.blocker.findMany({
    where: { status: { not: "resolved" } },
    include: { task: { include: { project: true } }, reportedBy: true, assignedTo: true },
  });

  // Compute insights for each project
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

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter(
      (t) => t.status === "completed"
    ).length;
    const blockedTasks = project.tasks.filter(
      (t) => t.status === "blocked"
    ).length;
    const totalBlockers = project.tasks.reduce(
      (sum, t) => sum + t.blockers.length,
      0
    );
    const completionPct = Math.round((completedTasks / totalTasks) * 100);

    const endDate = new Date(project.startDate);
    endDate.setDate(endDate.getDate() + cpmResult.projectDuration);

    let health: "on_track" | "at_risk" | "behind" = "on_track";
    if (totalBlockers > 2 || blockedTasks > 2) health = "behind";
    else if (totalBlockers > 0) health = "at_risk";
    if (project.targetDate && endDate > project.targetDate) health = "behind";

    return {
      project,
      cpmResult,
      resourceAnalysis,
      completionPct,
      completedTasks,
      totalTasks,
      blockedTasks,
      totalBlockers,
      endDate,
      health,
    };
  });

  const healthColors = {
    on_track: "text-green-600 bg-green-50",
    at_risk: "text-amber-600 bg-amber-50",
    behind: "text-red-600 bg-red-50",
  };

  const healthIcons = {
    on_track: CheckCircle2,
    at_risk: AlertTriangle,
    behind: AlertTriangle,
  };

  // Aggregate metrics
  const totalProjects = projects.length;
  const avgCompletion =
    projectInsights.length > 0
      ? Math.round(
          projectInsights.reduce((sum, p) => sum + p.completionPct, 0) /
            projectInsights.length
        )
      : 0;

  // Mood distribution from recent check-ins
  const moodCounts = recentCheckIns.reduce(
    (acc, c) => {
      const mood = c.mood || "neutral";
      acc[mood] = (acc[mood] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Project Insights</h1>
        <p className="text-muted-foreground mt-1">
          Stakeholder view of project health, risks, and team activity
        </p>
      </div>

      {/* High-level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Projects
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Completion
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgCompletion}%</div>
            <Progress value={avgCompletion} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Blockers
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {allBlockers.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team Mood</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(moodCounts).map(([mood, count]) => (
                <Badge key={mood} variant="outline" className="text-xs">
                  {mood}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Health Cards */}
      <div className="space-y-6">
        {projectInsights.map(
          ({
            project,
            cpmResult,
            resourceAnalysis,
            completionPct,
            completedTasks,
            totalTasks,
            totalBlockers,
            endDate,
            health,
          }) => {
            const HealthIcon = healthIcons[health];

            return (
              <Card key={project.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3">
                      {project.name}
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${healthColors[health]}`}
                      >
                        <HealthIcon className="h-3 w-3" />
                        {health.replace("_", " ").toUpperCase()}
                      </div>
                    </CardTitle>
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <BarChart3 className="h-3 w-3" />
                        Details
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Progress */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Progress
                      </h4>
                      <div className="text-2xl font-bold">
                        {completionPct}%
                      </div>
                      <Progress value={completionPct} className="mt-1" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {completedTasks}/{totalTasks} tasks done
                      </p>
                    </div>

                    {/* Timeline */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Clock className="h-4 w-4" /> Timeline
                      </h4>
                      <div className="text-2xl font-bold">
                        {cpmResult.projectDuration}d
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Est. completion:{" "}
                        {endDate.toLocaleDateString()}
                      </p>
                      {project.targetDate && (
                        <p
                          className={`text-xs mt-1 ${endDate > project.targetDate ? "text-red-600 font-medium" : "text-green-600"}`}
                        >
                          Target: {new Date(project.targetDate).toLocaleDateString()}
                          {endDate > project.targetDate
                            ? " (OVERDUE)"
                            : " (on track)"}
                        </p>
                      )}
                    </div>

                    {/* Critical Path */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" /> Critical Path
                      </h4>
                      <div className="text-2xl font-bold text-amber-600">
                        {cpmResult.criticalPath.length} tasks
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        No slack - any delay impacts timeline
                      </p>
                    </div>

                    {/* Blockers */}
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Blockers
                      </h4>
                      <div
                        className={`text-2xl font-bold ${totalBlockers > 0 ? "text-red-600" : "text-green-600"}`}
                      >
                        {totalBlockers}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {totalBlockers > 0
                          ? "Active blockers need attention"
                          : "No active blockers"}
                      </p>
                    </div>
                  </div>

                  {/* Resource Recommendations */}
                  {resourceAnalysis.recommendations.length > 0 && (
                    <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <h4 className="text-sm font-medium text-amber-800 mb-1 flex items-center gap-1">
                        <Users className="h-4 w-4" /> Resource Recommendations
                      </h4>
                      <ul className="space-y-1">
                        {resourceAnalysis.recommendations.map((rec, i) => (
                          <li key={i} className="text-xs text-amber-700">
                            - {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          }
        )}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Developer Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentCheckIns.slice(0, 8).map((checkIn) => (
              <div
                key={checkIn.id}
                className="flex items-center gap-3 text-sm"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">
                  {checkIn.developer.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <span className="font-medium">{checkIn.developer.name}</span>
                <span className="text-muted-foreground flex-1 truncate">
                  {checkIn.summary || "Checked in"}
                </span>
                {checkIn.mood && (
                  <Badge variant="outline" className="text-xs">
                    {checkIn.mood}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(checkIn.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Blockers Detail */}
      {allBlockers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Active Blockers Requiring Attention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allBlockers.map((blocker) => (
                <div key={blocker.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Badge
                      variant={
                        blocker.priority === "critical"
                          ? "destructive"
                          : "default"
                      }
                      className="text-xs"
                    >
                      {blocker.priority}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {blocker.description}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Project: {blocker.task?.project.name}</span>
                        <span>Task: {blocker.task?.name}</span>
                        <span>Reported by: {blocker.reportedBy.name}</span>
                        {blocker.assignedTo && (
                          <span>Assigned to: {blocker.assignedTo.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
