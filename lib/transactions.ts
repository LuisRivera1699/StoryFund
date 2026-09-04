"use client";

import * as StellarSdk from "@stellar/stellar-sdk";
import { stellarConfig } from "@/config/stellar";
import { humanizeError } from "@/lib/errors";
import { getRpc } from "@/lib/contract";
import { signTxWithFreighter } from "@/lib/wallet";
import type { TxPhase, TxState } from "@/types";

const { Api } = StellarSdk.rpc;

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

    // Poll until confirmed
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(1500);
      try {
        const txResp = await server.getTransaction(hash);
        if (txResp.status === Api.GetTransactionStatus.SUCCESS) {
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
            ledger: (txResp as { ledger?: number }).ledger,
            success: true,
          };
        }
        if (txResp.status === Api.GetTransactionStatus.FAILED) {
          throw new Error("Transaction failed on-chain during confirmation.");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("failed on-chain")) throw e;
        // not found yet
      }
    }
    throw new Error("Transaction submitted but confirmation timed out. Check Stellar Expert.");
  } catch (e) {
    const error = humanizeError(e);
    emit("failed", { error });
    throw new Error(error);
  }
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
