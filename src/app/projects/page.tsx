import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      tasks: {
        include: {
          assignee: true,
          blockers: { where: { status: { not: "resolved" } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Manage and monitor your projects
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {projects.map((project) => {
          const completed = project.tasks.filter(
            (t) => t.status === "completed"
          ).length;
          const inProgress = project.tasks.filter(
            (t) => t.status === "in_progress"
          ).length;
          const blocked = project.tasks.filter(
            (t) => t.status === "blocked"
          ).length;
          const totalBlockers = project.tasks.reduce(
            (sum, t) => sum + t.blockers.length,
            0
          );
          const progress =
            project.tasks.length > 0
              ? Math.round((completed / project.tasks.length) * 100)
              : 0;

          return (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{project.name}</CardTitle>
                    <Badge
                      variant={
                        project.status === "active" ? "default" : "outline"
                      }
                    >
                      {project.status}
                    </Badge>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold">{project.tasks.length}</div>
                        <div className="text-xs text-muted-foreground">Total</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{completed}</div>
                        <div className="text-xs text-muted-foreground">Done</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-blue-600">{inProgress}</div>
                        <div className="text-xs text-muted-foreground">Active</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-red-600">{blocked}</div>
                        <div className="text-xs text-muted-foreground">Blocked</div>
                      </div>
                    </div>
                    {totalBlockers > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        {totalBlockers} blocker{totalBlockers > 1 ? "s" : ""}
                      </Badge>
                    )}
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Started {new Date(project.startDate).toLocaleDateString()}</span>
                      {project.targetDate && (
                        <span>Target {new Date(project.targetDate).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
