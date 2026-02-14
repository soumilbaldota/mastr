import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BlockersPage() {
  const blockers = await prisma.blocker.findMany({
    include: {
      task: { include: { project: true } },
      reportedBy: { include: { team: true } },
      assignedTo: { include: { team: true } },
    },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
  });

  const openBlockers = blockers.filter((b) => b.status !== "resolved");
  const resolvedBlockers = blockers.filter((b) => b.status === "resolved");

  const priorityOrder = { critical: 0, high: 1, medium: 2 };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Blockers</h1>
        <p className="text-muted-foreground mt-1">
          Track and resolve blockers across your projects
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {openBlockers.length}
            </div>
            <p className="text-sm text-muted-foreground">Open Blockers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">
              {openBlockers.filter((b) => b.priority === "critical").length}
            </div>
            <p className="text-sm text-muted-foreground">Critical</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {resolvedBlockers.length}
            </div>
            <p className="text-sm text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Open Blockers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Open Blockers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openBlockers.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No open blockers! Everything is flowing smoothly.
            </p>
          ) : (
            <div className="space-y-4">
              {openBlockers
                .sort(
                  (a, b) =>
                    (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
                    (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
                )
                .map((blocker) => (
                  <div
                    key={blocker.id}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            blocker.priority === "critical"
                              ? "destructive"
                              : blocker.priority === "high"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {blocker.priority}
                        </Badge>
                        <Badge variant="outline">{blocker.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(blocker.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <p className="font-medium">{blocker.description}</p>

                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Reported by:
                        </span>
                        <span className="font-medium">
                          {blocker.reportedBy.name}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {blocker.reportedBy.team.name}
                        </Badge>
                      </div>

                      {blocker.assignedTo && (
                        <>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              Assigned to:
                            </span>
                            <span className="font-medium">
                              {blocker.assignedTo.name}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {blocker.assignedTo.team.name}
                            </Badge>
                          </div>
                        </>
                      )}
                    </div>

                    {blocker.task && (
                      <div className="text-xs text-muted-foreground">
                        Task: {blocker.task.name} &middot; Project:{" "}
                        {blocker.task.project.name}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolved */}
      {resolvedBlockers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">
              Resolved Blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {resolvedBlockers.map((blocker) => (
                <div
                  key={blocker.id}
                  className="flex items-center gap-3 rounded-lg border p-3 opacity-60"
                >
                  <Badge variant="outline" className="text-green-600">
                    resolved
                  </Badge>
                  <span className="text-sm">{blocker.description}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {blocker.resolvedAt
                      ? new Date(blocker.resolvedAt).toLocaleDateString()
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
