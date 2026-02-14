// CPM Types
export interface CPMTask {
  id: string;
  name: string;
  duration: number;
  dependencies: string[]; // task IDs this depends on
  es: number; // earliest start
  ef: number; // earliest finish
  ls: number; // latest start
  lf: number; // latest finish
  float: number; // slack/float
  isCritical: boolean;
  status: TaskStatus;
  assigneeId?: string;
  assigneeName?: string;
  progress: number;
}

export interface CPMResult {
  tasks: CPMTask[];
  criticalPath: string[]; // ordered task IDs on critical path
  projectDuration: number;
  estimatedEndDate: string;
}

export type TaskStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type BlockerStatus = "open" | "in_progress" | "resolved";
export type ProjectStatus = "active" | "completed" | "on_hold";
export type Priority = "low" | "medium" | "high" | "critical";
export type Mood = "positive" | "neutral" | "frustrated" | "blocked";

// DAG Visualization Types
export interface DAGNode {
  data: {
    id: string;
    label: string;
    status: TaskStatus;
    progress: number;
    duration: number;
    es: number;
    ef: number;
    ls: number;
    lf: number;
    float: number;
    isCritical: boolean;
    assignee?: string;
  };
}

export interface DAGEdge {
  data: {
    id: string;
    source: string;
    target: string;
    isCritical: boolean;
  };
}

// Check-in extraction
export interface CheckInExtraction {
  tasksWorkedOn: { taskId?: string; taskName: string; progress: number }[];
  blockers: { description: string; blockingTeam?: string; severity: Priority }[];
  resolvedBlockers: {
    description: string;
    person?: string | null;
    taskName?: string | null;
  }[];
  mood: Mood;
  summary: string;
  suggestions: string[];
}

// Project Insights
export interface ProjectInsight {
  projectHealth: "on_track" | "at_risk" | "behind";
  completionPercentage: number;
  estimatedCompletion: string;
  criticalPathLength: number;
  activeBlockers: number;
  resourceUtilization: ResourceUtilization[];
  recentHighlights: string[];
  risks: string[];
  recommendations: string[];
}

export interface ResourceUtilization {
  developerId: string;
  developerName: string;
  taskCount: number;
  criticalTasks: number;
  blockedTasks: number;
  utilization: "under" | "optimal" | "over";
}

// ElevenLabs WebSocket types
export interface ElevenLabsMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ConversationMessage {
  role: "agent" | "user";
  content: string;
  timestamp: Date;
}
