import * as StellarSdk from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";
import type {
  Allocation,
  Project,
  ProjectStats,
  ProjectStatus,
  Story,
  StoryStatus,
} from "@/types";

const { Contract, Address, nativeToScVal, scValToNative, xdr } = StellarSdk;
const { Server: RpcServer, Api } = StellarSdk.rpc;

type ScVal = StellarSdk.xdr.ScVal;
type Operation = StellarSdk.xdr.Operation;

export function getRpc(): InstanceType<typeof RpcServer> {
  return new RpcServer(stellarConfig.rpcUrl, { allowHttp: stellarConfig.rpcUrl.startsWith("http://") });
}

export function getHorizon(): StellarSdk.Horizon.Server {
  return new StellarSdk.Horizon.Server(stellarConfig.horizonUrl, {
    allowHttp: stellarConfig.horizonUrl.startsWith("http://"),
  });
}

export function requireContractId(): string {
  if (!stellarConfig.contractId) {
    throw new Error(
      "Contract ID is not configured. Deploy the StoryFund contract and set NEXT_PUBLIC_CONTRACT_ID.",
    );
  }
  return stellarConfig.contractId;
}

function projectStatusFrom(n: number | string): ProjectStatus {
  const map: ProjectStatus[] = [
    "Draft",
    "Funding",
    "Active",
    "Completed",
    "Cancelled",
    "Disputed",
  ];
  if (typeof n === "string") return n as ProjectStatus;
  return map[n] ?? "Draft";
}

function storyStatusFrom(n: number | string): StoryStatus {
  const map: StoryStatus[] = [
    "Open",
    "Funded",
    "InProgress",
    "Submitted",
    "UnderReview",
    "Completed",
    "Disputed",
    "Cancelled",
  ];
  if (typeof n === "string") return n as StoryStatus;
  return map[n] ?? "Open";
}

function parseProject(raw: Record<string, unknown>): Project {
  return {
    projectId: Number(raw.project_id),
    owner: String(raw.owner),
    title: String(raw.title),
    description: String(raw.description),
    createdAt: Number(raw.created_at),
    status: projectStatusFrom(raw.status as number),
    totalBudget: BigInt(raw.total_budget as string | number | bigint),
    fundedAmount: BigInt(raw.funded_amount as string | number | bigint),
    lockedAmount: BigInt(raw.locked_amount as string | number | bigint),
    releasedAmount: BigInt(raw.released_amount as string | number | bigint),
    reviewWindow: Number(raw.review_window),
    nextStoryId: Number(raw.next_story_id),
    storyCount: Number(raw.story_count),
    resolver: String(raw.resolver),
  };
}

function parseStory(raw: Record<string, unknown>): Story {
  return {
    storyId: Number(raw.story_id),
    projectId: Number(raw.project_id),
    title: String(raw.title),
    description: String(raw.description),
    acceptanceCriteria: String(raw.acceptance_criteria),
    budget: BigInt(raw.budget as string | number | bigint),
    fundedAmount: BigInt(raw.funded_amount as string | number | bigint),
    status: storyStatusFrom(raw.status as number),
    createdAt: Number(raw.created_at),
    completedAt: Number(raw.completed_at),
    submittedAt: Number(raw.submitted_at),
    reviewDeadline: Number(raw.review_deadline),
    githubUrl: String(raw.github_url ?? ""),
    paid: Boolean(raw.paid),
  };
}

async function simulateGet<T>(
  account: string,
  method: string,
  args: ScVal[],
  parser: (raw: unknown) => T,
): Promise<T> {
  const contractId = requireContractId();
  const server = getRpc();
  const source = await server.getAccount(account).catch(async () => {
    // View calls can use a dummy account if not funded — fall back to contract itself
    return new StellarSdk.Account(account, "0");
  });

  const contract = new Contract(contractId);
  const tx = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  if (!Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("Simulation did not return a result");
  }
  const native = scValToNative(sim.result.retval);
  return parser(native);
}

/** Read helpers — use any funded G-address as simulation source when available. */
export async function getProject(source: string, projectId: number): Promise<Project> {
  return simulateGet(
    source,
    "get_project",
    [nativeToScVal(projectId, { type: "u32" })],
    (raw) => parseProject(raw as Record<string, unknown>),
  );
}

export async function getStory(
  source: string,
  projectId: number,
  storyId: number,
): Promise<Story> {
  return simulateGet(
    source,
    "get_story",
    [
      nativeToScVal(projectId, { type: "u32" }),
      nativeToScVal(storyId, { type: "u32" }),
    ],
    (raw) => parseStory(raw as Record<string, unknown>),
  );
}

export async function getAllocations(
  source: string,
  projectId: number,
  storyId: number,
): Promise<Allocation[]> {
  return simulateGet(
    source,
    "get_allocations",
    [
      nativeToScVal(projectId, { type: "u32" }),
      nativeToScVal(storyId, { type: "u32" }),
    ],
    (raw) => {
      const list = raw as Array<{ developer: string; share_bps: number }>;
      return (list ?? []).map((a) => ({
        developer: String(a.developer),
        shareBps: Number(a.share_bps),
      }));
    },
  );
}

export async function getProjectStats(source: string, projectId: number): Promise<ProjectStats> {
  return simulateGet(
    source,
    "get_project_stats",
    [nativeToScVal(projectId, { type: "u32" })],
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        projectId: Number(r.project_id),
        totalBudget: BigInt(r.total_budget as string | number | bigint),
        funded: BigInt(r.funded as string | number | bigint),
        locked: BigInt(r.locked as string | number | bigint),
        released: BigInt(r.released as string | number | bigint),
        remaining: BigInt(r.remaining as string | number | bigint),
        status: projectStatusFrom(r.status as number),
        storyCount: Number(r.story_count),
      };
    },
  );
}

export async function getNextProjectId(source: string): Promise<number> {
  return simulateGet(source, "next_project_id", [], (raw) => Number(raw));
}

export async function listProjectStories(
  source: string,
  projectId: number,
): Promise<Story[]> {
  const project = await getProject(source, projectId);
  const stories: Story[] = [];
  for (let sid = 1; sid < project.nextStoryId; sid++) {
    try {
      stories.push(await getStory(source, projectId, sid));
    } catch {
      // skip missing
    }
  }
  return stories;
}

export type ContractMethod =
  | "initialize"
  | "create_project"
  | "create_story"
  | "assign_developers"
  | "fund_stories"
  | "start_story"
  | "submit_story"
  | "begin_review"
  | "approve_story"
  | "auto_complete_story"
  | "dispute_story"
  | "resolve_dispute"
  | "set_resolver"
  | "cancel_story"
  | "cancel_project";

export function buildContractOperation(
  method: ContractMethod,
  args: ScVal[],
): Operation {
  const contract = new Contract(requireContractId());
  return contract.call(method, ...args);
}

export function scAddress(address: string): ScVal {
  return Address.fromString(address).toScVal();
}

export function scString(value: string): ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function scU32(value: number): ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function scU64(value: number | bigint): ScVal {
  return nativeToScVal(value, { type: "u64" });
}

export function scI128(value: bigint): ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function scBool(value: boolean): ScVal {
  return nativeToScVal(value, { type: "bool" });
}

export function scVecU32(values: number[]): ScVal {
  return xdr.ScVal.scvVec(values.map((v) => nativeToScVal(v, { type: "u32" })));
}

export function scVecAddress(values: string[]): ScVal {
  return xdr.ScVal.scvVec(values.map((a) => Address.fromString(a).toScVal()));
}

export function scOptionU64(value: number | null): ScVal {
  if (value === null || value === undefined) {
    // Soroban Option::None
    return xdr.ScVal.scvVoid();
  }
  return nativeToScVal(value, { type: "u64" });
}

export { Address, Contract, nativeToScVal, scValToNative, Api, StellarSdk };
