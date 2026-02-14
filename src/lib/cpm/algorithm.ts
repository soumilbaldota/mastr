import { CPMInput, CPMNode, CPMResult } from "./types";

/**
 * Critical Path Method (CPM) Algorithm
 *
 * 1. Topological sort of tasks based on dependencies
 * 2. Forward pass: calculate ES (earliest start) and EF (earliest finish)
 * 3. Backward pass: calculate LS (latest start) and LF (latest finish)
 * 4. Calculate float/slack for each task
 * 5. Critical path = tasks with zero float
 */
export function calculateCPM(tasks: CPMInput[]): CPMResult {
  if (tasks.length === 0) {
    return { nodes: [], criticalPath: [], projectDuration: 0 };
  }

  const taskMap = new Map<string, CPMInput>();
  tasks.forEach((t) => taskMap.set(t.id, t));

  // Build adjacency lists
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  tasks.forEach((t) => {
    successors.set(t.id, []);
    predecessors.set(t.id, [...t.dependencies]);
  });
  tasks.forEach((t) => {
    t.dependencies.forEach((depId) => {
      const succs = successors.get(depId);
      if (succs) succs.push(t.id);
    });
  });

  // Topological sort (Kahn's algorithm)
  const sorted = topologicalSort(tasks, predecessors, successors);

  // Initialize CPM nodes
  const nodes = new Map<string, CPMNode>();
  sorted.forEach((id) => {
    const task = taskMap.get(id)!;
    nodes.set(id, {
      ...task,
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      float: 0,
      isCritical: false,
    });
  });

  // Forward pass: calculate ES and EF
  sorted.forEach((id) => {
    const node = nodes.get(id)!;
    const preds = predecessors.get(id) || [];

    if (preds.length === 0) {
      node.es = 0;
    } else {
      node.es = Math.max(...preds.map((pId) => nodes.get(pId)?.ef ?? 0));
    }
    // If task is completed, effective duration is 0 for scheduling purposes
    const effectiveDuration =
      node.status === "completed"
        ? 0
        : Math.ceil(node.duration * (1 - node.progress / 100));
    node.ef = node.es + effectiveDuration;
  });

  // Project duration = max EF
  const projectDuration = Math.max(...Array.from(nodes.values()).map((n) => n.ef));

  // Backward pass: calculate LS and LF
  const reversed = [...sorted].reverse();
  reversed.forEach((id) => {
    const node = nodes.get(id)!;
    const succs = successors.get(id) || [];

    if (succs.length === 0) {
      node.lf = projectDuration;
    } else {
      node.lf = Math.min(...succs.map((sId) => nodes.get(sId)?.ls ?? projectDuration));
    }
    const effectiveDuration =
      node.status === "completed"
        ? 0
        : Math.ceil(node.duration * (1 - node.progress / 100));
    node.ls = node.lf - effectiveDuration;
  });

  // Calculate float and identify critical path
  const criticalPath: string[] = [];
  nodes.forEach((node) => {
    node.float = node.ls - node.es;
    node.isCritical = node.float === 0;
    if (node.isCritical) {
      criticalPath.push(node.id);
    }
  });

  // Order critical path by ES
  criticalPath.sort((a, b) => (nodes.get(a)?.es ?? 0) - (nodes.get(b)?.es ?? 0));

  return {
    nodes: sorted.map((id) => nodes.get(id)!),
    criticalPath,
    projectDuration,
  };
}

function topologicalSort(
  tasks: CPMInput[],
  predecessors: Map<string, string[]>,
  successors: Map<string, string[]>
): string[] {
  const inDegree = new Map<string, number>();
  tasks.forEach((t) => {
    inDegree.set(t.id, (predecessors.get(t.id) || []).length);
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    (successors.get(id) || []).forEach((succId) => {
      const newDeg = (inDegree.get(succId) || 1) - 1;
      inDegree.set(succId, newDeg);
      if (newDeg === 0) queue.push(succId);
    });
  }

  if (sorted.length !== tasks.length) {
    console.warn("Cycle detected in task dependencies. Processing available tasks only.");
  }

  return sorted;
}

/**
 * Identify resource bottlenecks - developers with too many critical tasks
 */
export function analyzeResourceAllocation(result: CPMResult) {
  const developerLoad = new Map<
    string,
    { name: string; tasks: number; criticalTasks: number; totalDuration: number }
  >();

  result.nodes.forEach((node) => {
    if (!node.assigneeId) return;
    const existing = developerLoad.get(node.assigneeId) || {
      name: node.assigneeName || "Unknown",
      tasks: 0,
      criticalTasks: 0,
      totalDuration: 0,
    };
    existing.tasks++;
    if (node.isCritical) existing.criticalTasks++;
    existing.totalDuration += node.duration;
    developerLoad.set(node.assigneeId, existing);
  });

  const recommendations: string[] = [];
  developerLoad.forEach((load, devId) => {
    if (load.criticalTasks >= 3) {
      recommendations.push(
        `${load.name} (${devId}) has ${load.criticalTasks} critical tasks. Consider redistributing to reduce risk.`
      );
    }
    if (load.totalDuration > result.projectDuration * 0.7) {
      recommendations.push(
        `${load.name} is assigned ${load.totalDuration} days of work across ${load.tasks} tasks. This exceeds 70% of the project timeline.`
      );
    }
  });

  return {
    developerLoad: Array.from(developerLoad.entries()).map(([id, load]) => ({
      developerId: id,
      ...load,
    })),
    recommendations,
  };
}
