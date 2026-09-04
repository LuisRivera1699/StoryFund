"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  connectFreighter,
  detectFreighter,
  getFreighterAddress,
  getFreighterNetwork,
} from "@/lib/wallet";
import { getTokenBalance, getXlmBalance } from "@/lib/token";
import { stellarConfig } from "@/config/stellar";
import { humanizeError } from "@/lib/errors";
import type { WalletState } from "@/types";

interface WalletContextValue extends WalletState {
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "storyfund_wallet_connected";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    network: null,
    networkPassphrase: null,
    balance: null,
    tokenBalance: null,
    freighterInstalled: false,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalances = useCallback(async () => {
    const address = state.address ?? (await getFreighterAddress());
    if (!address) return;
    const [xlm, token] = await Promise.all([
      getXlmBalance(address),
      getTokenBalance(address),
    ]);
    setState((s) => ({ ...s, balance: xlm, tokenBalance: token, address }));
  }, [state.address]);

  const hydrate = useCallback(async () => {
    const installed = await detectFreighter();
    setState((s) => ({ ...s, freighterInstalled: installed }));
    if (!installed) return;
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) !== "1") {
      return;
    }
    try {
      const address = await getFreighterAddress();
      if (!address) return;
      const net = await getFreighterNetwork();
      const [xlm, token] = await Promise.all([
        getXlmBalance(address),
        getTokenBalance(address),
      ]);
      setState({
        connected: true,
        address,
        network: net.network,
        networkPassphrase: net.networkPassphrase,
        balance: xlm,
        tokenBalance: token,
        freighterInstalled: true,
      });
    } catch (e) {
      setError(humanizeError(e));
    }
  }, []);

  useEffect(() => {
    void hydrate();
    const onFocus = () => void hydrate();
    window.addEventListener("focus", onFocus);

    // Poll for account / network changes from Freighter
    const id = window.setInterval(async () => {
      if (localStorage.getItem(STORAGE_KEY) !== "1") return;
      try {
        const address = await getFreighterAddress();
        const net = await getFreighterNetwork();
        setState((s) => {
          if (!s.connected) return s;
          if (s.address === address && s.networkPassphrase === net.networkPassphrase) {
            return s;
          }
          return {
            ...s,
            address,
            network: net.network,
            networkPassphrase: net.networkPassphrase,
          };
        });
      } catch {
        // ignore
      }
    }, 4000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [hydrate]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const address = await connectFreighter();
      const net = await getFreighterNetwork();
      const [xlm, token] = await Promise.all([
        getXlmBalance(address),
        getTokenBalance(address),
      ]);
      localStorage.setItem(STORAGE_KEY, "1");
      setState({
        connected: true,
        address,
        network: net.network,
        networkPassphrase: net.networkPassphrase,
        balance: xlm,
        tokenBalance: token,
        freighterInstalled: true,
      });
    } catch (e) {
      setError(humanizeError(e));
      throw e;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState((s) => ({
      ...s,
      connected: false,
      address: null,
      balance: null,
      tokenBalance: null,
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      connecting,
      error,
      connect,
      disconnect,
      refreshBalances,
    }),
    [state, connecting, error, connect, disconnect, refreshBalances],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function useNetworkMismatch(): boolean {
  const { connected, networkPassphrase } = useWallet();
  if (!connected || !networkPassphrase) return false;
  return networkPassphrase !== stellarConfig.networkPassphrase;
}
