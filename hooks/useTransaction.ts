"use client";

import { useCallback, useState } from "react";
import type { TxState } from "@/types";
import { prepareSignAndSend } from "@/lib/transactions";
import type * as StellarSdk from "@stellar/stellar-sdk";
import { useWallet } from "@/hooks/useWallet";

const idle: TxState = { phase: "idle" };

export function useTransaction() {
  const { address, refreshBalances } = useWallet();
  const [tx, setTx] = useState<TxState>(idle);

  const reset = useCallback(() => setTx(idle), []);

  const run = useCallback(
    async (
      operations: StellarSdk.xdr.Operation[],
      label: string,
    ): Promise<{ hash: string }> => {
      if (!address) throw new Error("Connect Freighter first");
      const result = await prepareSignAndSend({
        sourceAddress: address,
        operations,
        label,
        onProgress: setTx,
      });
      await refreshBalances();
      return { hash: result.hash };
    },
    [address, refreshBalances],
  );

  return { tx, run, reset, setTx };
}
