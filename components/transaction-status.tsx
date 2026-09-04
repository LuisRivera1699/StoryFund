"use client";

import { Badge } from "@/components/ui/badge";
import { explorerTxUrl } from "@/config/stellar";
import type { TxState } from "@/types";
import { CheckCircle2, Loader2, XCircle, ExternalLink } from "lucide-react";

const LABELS: Record<string, string> = {
  idle: "",
  preparing: "Preparing transaction…",
  awaiting_signature: "Waiting for Freighter…",
  submitted: "Transaction submitted…",
  confirming: "Confirming on Stellar…",
  confirmed: "Confirmed",
  failed: "Transaction failed",
};

export function TransactionStatus({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;

  const pending =
    tx.phase === "preparing" ||
    tx.phase === "awaiting_signature" ||
    tx.phase === "submitted" ||
    tx.phase === "confirming";

  return (
    <div className="animate-fade-in rounded-lg border border-border bg-white/90 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {pending && <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />}
        {tx.phase === "confirmed" && <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />}
        {tx.phase === "failed" && <XCircle className="mt-0.5 h-5 w-5 text-destructive" />}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{tx.label ?? LABELS[tx.phase]}</p>
            <Badge variant={tx.phase === "failed" ? "destructive" : tx.phase === "confirmed" ? "success" : "muted"}>
              {LABELS[tx.phase]}
            </Badge>
          </div>
          {tx.hash && (
            <a
              href={explorerTxUrl(tx.hash)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
            >
              {tx.hash.slice(0, 16)}… <ExternalLink className="h-3 w-3" /> View on Stellar Expert
            </a>
          )}
          {tx.error && <p className="text-sm text-destructive">{tx.error}</p>}
        </div>
      </div>
    </div>
  );
}
