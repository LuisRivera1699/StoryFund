"use client";

import * as StellarSdk from "@stellar/stellar-sdk";
import { explorerTxUrl, stellarConfig } from "@/config/stellar";
import { humanizeError } from "@/lib/errors";
import { getHorizon, getRpc } from "@/lib/contract";
import { signTxWithFreighter } from "@/lib/wallet";
import type { TxPhase, TxState } from "@/types";

const { Api } = StellarSdk.rpc;

function isTxSuccess(status: unknown): boolean {
  return status === "SUCCESS" || status === Api.GetTransactionStatus.SUCCESS;
}

function isTxFailed(status: unknown): boolean {
  return status === "FAILED" || status === Api.GetTransactionStatus.FAILED;
}

function isTxNotFound(status: unknown): boolean {
  return status === "NOT_FOUND" || status === Api.GetTransactionStatus.NOT_FOUND;
}

export type TxProgressFn = (state: TxState) => void;

export interface SendResult {
  hash: string;
  ledger?: number;
  success: boolean;
}

/**
 * Build → simulate → Freighter sign → submit → confirm.
 * Never reports success before network confirmation.
 */
export async function prepareSignAndSend(opts: {
  sourceAddress: string;
  operations: StellarSdk.xdr.Operation[];
  onProgress?: TxProgressFn;
  label?: string;
}): Promise<SendResult> {
  const { sourceAddress, operations, onProgress, label } = opts;
  const emit = (phase: TxPhase, extra?: Partial<TxState>) =>
    onProgress?.({ phase, label, ...extra });

  try {
    emit("preparing");
    const server = getRpc();
    const account = await server.getAccount(sourceAddress);

    let tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    });
    for (const op of operations) {
      tx = tx.addOperation(op);
    }
    const built = tx.setTimeout(180).build();

    const simulated = await server.simulateTransaction(built);
    if (Api.isSimulationError(simulated)) {
      throw new Error(simulated.error);
    }

    const prepared = StellarSdk.rpc.assembleTransaction(built, simulated).build();

    emit("awaiting_signature");
    const signedXdr = await signTxWithFreighter(prepared.toXDR(), {
      address: sourceAddress,
      networkPassphrase: stellarConfig.networkPassphrase,
    });

    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      stellarConfig.networkPassphrase,
    );

    emit("submitted");
    const send = await server.sendTransaction(signedTx);
    if (send.status === "ERROR") {
      throw new Error(
        `Transaction rejected by network: ${JSON.stringify(send.errorResult ?? send)}`,
      );
    }

    const hash = send.hash;
    emit("confirming", { hash });

    const confirmed = await waitUntilConfirmed(server, hash);
    emit("confirmed", { hash });
    persistTx({
      hash,
      action: label ?? "contract_call",
      timestamp: Date.now(),
      status: "confirmed",
      sender: sourceAddress,
    });
    return {
      hash,
      ledger: confirmed.ledger,
      success: true,
    };
  } catch (e) {
    const error = humanizeError(e);
    emit("failed", { error });
    throw new Error(error);
  }
}

/**
 * Wait for Soroban RPC (and Horizon fallback) to show the tx as successful.
 * String status checks avoid enum interop issues in the browser bundle.
 */
async function waitUntilConfirmed(
  server: ReturnType<typeof getRpc>,
  hash: string,
): Promise<{ ledger?: number }> {
  const maxAttempts = 40;
  let lastRpcError: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await sleep(1200);
    try {
      const txResp = await server.getTransaction(hash);
      if (isTxSuccess(txResp.status)) {
        return { ledger: (txResp as { ledger?: number }).ledger };
      }
      if (isTxFailed(txResp.status)) {
        throw new Error("Transaction failed on-chain during confirmation.");
      }
      // NOT_FOUND / pending — keep polling
      if (!isTxNotFound(txResp.status) && txResp.status != null) {
        // Unknown status: try Horizon before giving up this attempt
        const fromHorizon = await confirmViaHorizon(hash);
        if (fromHorizon) return fromHorizon;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
      lastRpcError = e;
      const fromHorizon = await confirmViaHorizon(hash);
      if (fromHorizon) return fromHorizon;
    }
  }

  const fromHorizon = await confirmViaHorizon(hash);
  if (fromHorizon) return fromHorizon;

  const detail =
    lastRpcError instanceof Error && lastRpcError.message
      ? ` Last RPC error: ${lastRpcError.message}`
      : "";
  throw new Error(
    `Transaction submitted but confirmation timed out.${detail} Check ${explorerTxUrl(hash)}`,
  );
}

async function confirmViaHorizon(hash: string): Promise<{ ledger?: number } | null> {
  try {
    const horizon = getHorizon();
    const tx = await horizon.transactions().transaction(hash).call();
    if (tx.successful) {
      return { ledger: typeof tx.ledger === "number" ? tx.ledger : undefined };
    }
    if (tx.successful === false) {
      throw new Error("Transaction failed on-chain during confirmation.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
    // 404 / not ingested yet
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const TX_KEY = "storyfund_tx_history";

export function persistTx(record: {
  hash: string;
  action: string;
  projectId?: number;
  storyId?: number;
  amount?: string;
  timestamp: number;
  status: "confirmed" | "failed";
  sender?: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const prev = JSON.parse(localStorage.getItem(TX_KEY) ?? "[]") as unknown[];
    const next = [record, ...prev].slice(0, 100);
    localStorage.setItem(TX_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function loadTxHistory(): Array<{
  hash: string;
  action: string;
  projectId?: number;
  storyId?: number;
  amount?: string;
  timestamp: number;
  status: "confirmed" | "failed";
  sender?: string;
}> {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(TX_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Local index of project IDs discovered by this browser (UX only — not source of truth). */
const PROJECT_INDEX_KEY = "storyfund_project_ids";

export function rememberProjectId(id: number) {
  if (typeof window === "undefined") return;
  const ids = loadProjectIds();
  if (!ids.includes(id)) {
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify([id, ...ids]));
  }
}

export function loadProjectIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY) ?? "[]");
  } catch {
    return [];
  }
}
