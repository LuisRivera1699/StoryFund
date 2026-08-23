/**
 * Reputation layer — design placeholder for a future indexer.
 * Do NOT invent or display fake stats. Populate only from verified on-chain events.
 */
export interface DeveloperReputation {
  address: string;
  completionRateBps: number; // 0–10_000
  earned: bigint;
  storiesCompleted: number;
  disputes: number;
}

export interface ClientReputation {
  address: string;
  funded: bigint;
  storiesApproved: number;
  disputes: number;
}
