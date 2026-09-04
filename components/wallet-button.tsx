"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNetworkMismatch, useWallet } from "@/hooks/useWallet";
import { shortenAddress } from "@/lib/utils";
import { stellarConfig } from "@/config/stellar";
import { Wallet, LogOut, AlertTriangle } from "lucide-react";

export function WalletButton() {
  const {
    connected,
    address,
    connecting,
    freighterInstalled,
    connect,
    disconnect,
    tokenBalance,
    network,
    error,
  } = useWallet();
  const mismatch = useNetworkMismatch();

  if (!freighterInstalled) {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white/70 px-4 text-sm font-medium hover:bg-secondary"
      >
        Install Freighter
      </a>
    );
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={() => void connect().catch(() => undefined)} disabled={connecting}>
          <Wallet className="h-4 w-4" />
          {connecting ? "Connecting…" : "Connect Freighter"}
        </Button>
        {error && <span className="max-w-xs text-right text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {mismatch && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Wrong network
        </Badge>
      )}
      <div className="hidden text-right text-xs sm:block">
        <div className="font-mono text-foreground">{shortenAddress(address ?? "", 5)}</div>
        <div className="text-muted-foreground">
          {network ?? stellarConfig.network} · {tokenBalance ?? "—"} {stellarConfig.tokenSymbol}
        </div>
      </div>
      <Button variant="outline" size="icon" onClick={disconnect} title="Disconnect">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-6">
          <Link href="/" className="font-display text-xl tracking-tight text-foreground">
            Story<span className="text-primary">Fund</span>
          </Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/projects/new" className="text-sm text-muted-foreground hover:text-foreground">
            New project
          </Link>
        </nav>
        <WalletButton />
      </div>
    </header>
  );
}
