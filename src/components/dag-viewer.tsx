"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CPMNode } from "@/lib/cpm/types";

interface DAGViewerProps {
  projectId: string;
}

const STATUS_COLORS: Record<string, string> = {
  not_started: "#9ca3af",
  in_progress: "#3b82f6",
  completed: "#22c55e",
  blocked: "#ef4444",
};

export function DAGViewer({ projectId }: DAGViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<unknown>(null);
  const [selectedNode, setSelectedNode] = useState<CPMNode | null>(null);
  const [loading, setLoading] = useState(true);

  const initGraph = useCallback(async () => {
    if (!containerRef.current) return;

    const res = await fetch(`/api/projects/${projectId}/cpm`);
    const data = await res.json();
    const nodes: CPMNode[] = data.nodes;
    const criticalPath: string[] = data.criticalPath;

    // Dynamic import for cytoscape (client-only)
    const cytoscape = (await import("cytoscape")).default;
    const dagre = (await import("cytoscape-dagre")).default;
    cytoscape.use(dagre);

    const elements = [
      ...nodes.map((node) => ({
        group: "nodes" as const,
        data: {
          id: node.id,
          label: node.name,
          status: node.status,
          progress: node.progress,
          duration: node.duration,
          es: node.es,
          ef: node.ef,
          ls: node.ls,
          lf: node.lf,
          float: node.float,
          isCritical: node.isCritical,
          assignee: node.assigneeName || "Unassigned",
        },
      })),
      ...nodes.flatMap((node) =>
        node.dependencies.map((depId) => ({
          group: "edges" as const,
          data: {
            id: `${depId}->${node.id}`,
            source: depId,
            target: node.id,
            isCritical:
              criticalPath.includes(depId) && criticalPath.includes(node.id),
          },
        }))
      ),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "background-color": (ele: { data: (key: string) => string }) =>
              STATUS_COLORS[ele.data("status")] || "#9ca3af",
            color: "#fff",
            "text-outline-color": (ele: { data: (key: string) => string }) =>
              STATUS_COLORS[ele.data("status")] || "#9ca3af",
            "text-outline-width": 2,
            "font-size": "11px",
            width: 60,
            height: 60,
            "border-width": (ele: { data: (key: string) => string }) =>
              String(ele.data("isCritical")) === "true"
                ? 4
                : 2,
            "border-color": (ele: { data: (key: string) => string }) =>
              String(ele.data("isCritical")) === "true"
                ? "#f59e0b"
                : "#e5e7eb",
            "text-wrap": "wrap",
            "text-max-width": "55px",
          } as Record<string, unknown>,
        },
        {
          selector: "edge",
          style: {
            width: (ele: { data: (key: string) => unknown }) =>
              ele.data("isCritical") ? 3 : 1.5,
            "line-color": (ele: { data: (key: string) => unknown }) =>
              ele.data("isCritical") ? "#f59e0b" : "#d1d5db",
            "target-arrow-color": (ele: { data: (key: string) => unknown }) =>
              ele.data("isCritical") ? "#f59e0b" : "#d1d5db",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 1.2,
          } as Record<string, unknown>,
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#8b5cf6",
            "border-width": 4,
          },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 50,
        rankSep: 80,
        padding: 30,
      } as any,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cy.on("tap", "node", (evt: { target: { data: () => Record<string, unknown> } }) => {
      const nodeData = evt.target.data();
      setSelectedNode(nodeData as unknown as CPMNode);
    });

    cy.on("tap", (evt: { target: { isNode?: () => boolean } }) => {
      if (!evt.target.isNode?.()) {
        setSelectedNode(null);
      }
    });

    cyRef.current = cy;
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    initGraph();
    return () => {
      if (cyRef.current && typeof (cyRef.current as { destroy: () => void }).destroy === "function") {
        (cyRef.current as { destroy: () => void }).destroy();
      }
    };
  }, [initGraph]);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize">{status.replace("_", " ")}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-amber-500 bg-transparent" />
          <span>Critical Path</span>
        </div>
      </div>

      {/* Graph Container */}
      <div
        ref={containerRef}
        className="w-full h-[500px] border rounded-lg bg-gray-50"
      />
      {loading && (
        <div className="flex items-center justify-center h-[500px] absolute inset-0">
          <span className="text-muted-foreground">Loading graph...</span>
        </div>
      )}

      {/* Selected Node Details */}
      {selectedNode && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold text-lg">
            {(selectedNode as unknown as Record<string, string>).label || selectedNode.name}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Duration:</span>{" "}
              <strong>{selectedNode.duration} days</strong>
            </div>
            <div>
              <span className="text-muted-foreground">ES/EF:</span>{" "}
              <strong>
                {selectedNode.es}/{selectedNode.ef}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">LS/LF:</span>{" "}
              <strong>
                {selectedNode.ls}/{selectedNode.lf}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">Float:</span>{" "}
              <strong>{selectedNode.float} days</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Assignee:</span>{" "}
              <strong>
                {(selectedNode as unknown as Record<string, string>).assignee ||
                  selectedNode.assigneeName ||
                  "Unassigned"}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">Progress:</span>{" "}
              <strong>{selectedNode.progress}%</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Critical:</span>{" "}
              <strong>{selectedNode.isCritical ? "Yes" : "No"}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
