export type ProjectStatus =
  | "Draft"
  | "Funding"
  | "Active"
  | "Completed"
  | "Cancelled"
  | "Disputed";

export type StoryStatus =
  | "Open"
  | "Funded"
  | "InProgress"
  | "Submitted"
  | "UnderReview"
  | "Completed"
  | "Disputed"
  | "Cancelled";

export interface Allocation {
  developer: string;
  shareBps: number;
}

export interface Project {
  projectId: number;
  owner: string;
  title: string;
  description: string;
  createdAt: number;
  status: ProjectStatus;
  totalBudget: bigint;
  fundedAmount: bigint;
  lockedAmount: bigint;
  releasedAmount: bigint;
  reviewWindow: number;
  nextStoryId: number;
  storyCount: number;
  resolver: string;
}

export interface Story {
  storyId: number;
  projectId: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  budget: bigint;
  fundedAmount: bigint;
  status: StoryStatus;
  createdAt: number;
  completedAt: number;
  submittedAt: number;
  reviewDeadline: number;
  githubUrl: string;
  paid: boolean;
}

export interface ProjectStats {
  projectId: number;
  totalBudget: bigint;
  funded: bigint;
  locked: bigint;
  released: bigint;
  remaining: bigint;
  status: ProjectStatus;
  storyCount: number;
}

export type TxPhase =
  | "idle"
  | "preparing"
  | "awaiting_signature"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

export interface TxState {
  phase: TxPhase;
  hash?: string;
  error?: string;
  label?: string;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  balance: string | null;
  tokenBalance: string | null;
  freighterInstalled: boolean;
}

export interface LocalTxRecord {
  hash: string;
  action: string;
  projectId?: number;
  storyId?: number;
  amount?: string;
  timestamp: number;
  status: "confirmed" | "failed";
  sender?: string;
}
