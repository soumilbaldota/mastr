import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DAGViewer } from "@/components/dag-viewer";
import { CPMDashboard } from "@/components/cpm-dashboard";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          assignee: true,
          dependsOn: { include: { dependency: true } },
          dependedBy: { include: { dependent: true } },
          blockers: { where: { status: { not: "resolved" } } },
        },
      },
    },
  });

  if (!project) notFound();

  const completed = project.tasks.filter((t) => t.status === "completed").length;
  const progress =
    project.tasks.length > 0
      ? Math.round((completed / project.tasks.length) * 100)
      : 0;

  const statusColors: Record<string, string> = {
    not_started: "bg-gray-100 text-gray-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    blocked: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge variant="outline">{project.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">{project.description}</p>
        </div>
        <Link href={`/projects/${id}/insights`}>
          <Button variant="outline" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Insights
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Project Progress</span>
            <span className="text-sm font-bold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>
              {completed} of {project.tasks.length} tasks completed
            </span>
            {project.targetDate && (
              <span>
                Target: {new Date(project.targetDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="dag" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dag">DAG View</TabsTrigger>
          <TabsTrigger value="cpm">Critical Path</TabsTrigger>
          <TabsTrigger value="tasks">Task List</TabsTrigger>
        </TabsList>

        <TabsContent value="dag">
          <Card>
            <CardHeader>
              <CardTitle>Dependency Graph</CardTitle>
            </CardHeader>
            <CardContent>
              <DAGViewer projectId={project.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cpm">
          <CPMDashboard projectId={project.id} />
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>All Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {project.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 rounded-lg border p-4"
                  >
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${statusColors[task.status] || ""}`}
                    >
                      {task.status.replace("_", " ")}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.name}</span>
                        <Badge
                          variant={
                            task.priority === "critical"
                              ? "destructive"
                              : task.priority === "high"
                                ? "default"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {task.assignee && (
                          <span>Assigned: {task.assignee.name}</span>
                        )}
                        <span>Duration: {task.duration} days</span>
                        {task.dependsOn.length > 0 && (
                          <span>
                            Depends on:{" "}
                            {task.dependsOn.map((d) => d.dependency.name).join(", ")}
                          </span>
                        )}
                      </div>
                      {task.blockers.length > 0 && (
                        <div className="mt-2">
                          {task.blockers.map((b) => (
                            <Badge key={b.id} variant="destructive" className="text-xs mr-1">
                              Blocked: {b.description.slice(0, 50)}...
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right min-w-[80px]">
                      <div className="text-sm font-medium">{task.progress}%</div>
                      <Progress value={task.progress} className="mt-1 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
