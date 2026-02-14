export interface CPMInput {
  id: string;
  name: string;
  duration: number;
  dependencies: string[];
  status: string;
  progress: number;
  assigneeId?: string;
  assigneeName?: string;
}

export interface CPMNode {
  id: string;
  name: string;
  duration: number;
  dependencies: string[];
  es: number; // Earliest Start
  ef: number; // Earliest Finish
  ls: number; // Latest Start
  lf: number; // Latest Finish
  float: number; // Total Float (slack)
  isCritical: boolean;
  status: string;
  progress: number;
  assigneeId?: string;
  assigneeName?: string;
}

export interface CPMResult {
  nodes: CPMNode[];
  criticalPath: string[];
  projectDuration: number;
}
