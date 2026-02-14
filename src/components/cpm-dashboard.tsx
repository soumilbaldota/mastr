"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Clock, TrendingUp, Users } from "lucide-react";
import type { CPMNode } from "@/lib/cpm/types";

interface CPMData {
  nodes: CPMNode[];
  criticalPath: string[];
  projectDuration: number;
  projectName: string;
  startDate: string;
  estimatedEndDate: string;
  targetDate?: string;
  resourceAnalysis: {
    developerLoad: {
      developerId: string;
      name: string;
      tasks: number;
      criticalTasks: number;
      totalDuration: number;
    }[];
    recommendations: string[];
  };
}

export function CPMDashboard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<CPMData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/cpm`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading CPM analysis...
      </div>
    );
  }

  if (!data) return null;

  const isOverdue =
    data.targetDate && new Date(data.estimatedEndDate) > new Date(data.targetDate);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Project Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.projectDuration} days
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Est. end: {new Date(data.estimatedEndDate).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Critical Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {data.criticalPath.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              of {data.nodes.length} total tasks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Schedule Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${isOverdue ? "text-red-600" : "text-green-600"}`}
            >
              {isOverdue ? "At Risk" : "On Track"}
            </div>
            {data.targetDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Target: {new Date(data.targetDate).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Resource Load
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.resourceAnalysis.developerLoad.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              developers assigned
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Path Table */}
      <Card>
        <CardHeader>
          <CardTitle>Task Schedule (CPM Analysis)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>ES</TableHead>
                <TableHead>EF</TableHead>
                <TableHead>LS</TableHead>
                <TableHead>LF</TableHead>
                <TableHead>Float</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Critical</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.nodes.map((node) => (
                <TableRow
                  key={node.id}
                  className={node.isCritical ? "bg-amber-50" : ""}
                >
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell>{node.duration}d</TableCell>
                  <TableCell>{node.es}</TableCell>
                  <TableCell>{node.ef}</TableCell>
                  <TableCell>{node.ls}</TableCell>
                  <TableCell>{node.lf}</TableCell>
                  <TableCell>
                    <Badge
                      variant={node.float === 0 ? "destructive" : "secondary"}
                    >
                      {node.float}d
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        node.status === "completed"
                          ? "default"
                          : node.status === "blocked"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {node.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {node.isCritical && (
                      <Badge className="bg-amber-500">Critical</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Resource Allocation */}
      <Card>
        <CardHeader>
          <CardTitle>Resource Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.resourceAnalysis.developerLoad.map((dev) => (
              <div key={dev.developerId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{dev.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {dev.tasks} tasks ({dev.criticalTasks} critical)
                    </span>
                  </div>
                  <span className="text-sm font-medium">
                    {dev.totalDuration} days
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    (dev.totalDuration / data.projectDuration) * 100,
                    100
                  )}
                  className={`h-2 ${dev.criticalTasks >= 3 ? "[&>div]:bg-red-500" : ""}`}
                />
              </div>
            ))}
          </div>

          {data.resourceAnalysis.recommendations.length > 0 && (
            <div className="mt-6 rounded-lg bg-amber-50 p-4">
              <h4 className="font-medium text-amber-800 mb-2">
                Recommendations
              </h4>
              <ul className="space-y-1">
                {data.resourceAnalysis.recommendations.map((rec, i) => (
                  <li
                    key={i}
                    className="text-sm text-amber-700 flex items-start gap-2"
                  >
                    <span>-</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
