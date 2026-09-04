"use client";

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  getNetworkDetails,
  signTransaction,
} from "@stellar/freighter-api";
import { stellarConfig } from "@/config/stellar";
import { humanizeError } from "@/lib/errors";

const NOT_INSTALLED =
  "Freighter is not installed or not responding. Unlock Freighter, use Chrome/Brave/Firefox (not an in-app browser), allow this site, then refresh.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      },
    );
  });
}

function readIsConnected(result: unknown): boolean {
  if (typeof result === "boolean") return result;
  if (result && typeof result === "object" && "isConnected" in result) {
    return Boolean((result as { isConnected: boolean }).isConnected);
  }
  return false;
}

/** Freighter's isConnected() times out to false in ~2s if the content script is slow. Retry. */
export async function detectFreighter(retries = 4): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await isConnected();
      if (readIsConnected(result)) return true;
    } catch {
      // try again
    }
    if (i < retries - 1) await sleep(400 * (i + 1));
  }
  // Last resort: some Freighter builds expose a global flag
  if (typeof window !== "undefined") {
    const w = window as Window & { freighter?: unknown; freighterApi?: unknown };
    if (w.freighter || w.freighterApi) return true;
  }
  return false;
}

export async function connectFreighter(): Promise<string> {
  // Soft check — do not hard-fail solely on a single flaky isConnected() timeout.
  const installed = await detectFreighter();

  let address: string | undefined;
  try {
    const access = await withTimeout(requestAccess(), 60_000);
    if (access && typeof access === "object" && "error" in access && access.error) {
      throw new Error(String(access.error));
    }
    address =
      typeof access === "string"
        ? access
        : (access as { address?: string }).address;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!installed || msg === "timeout" || /not installed|not found|no wallet/i.test(msg)) {
      throw new Error(NOT_INSTALLED);
    }
    throw e;
  }

  if (!address) {
    // Fallback for older Freighter flows
    const addressResult = await getAddress();
    if (addressResult && typeof addressResult === "object" && "error" in addressResult && addressResult.error) {
      throw new Error(String(addressResult.error));
    }
    address =
      typeof addressResult === "string"
        ? addressResult
        : (addressResult as { address?: string }).address;
  }

  if (!address) throw new Error(NOT_INSTALLED);

  await assertCorrectNetwork();
  return address;
}

export async function getFreighterAddress(): Promise<string | null> {
  try {
    const installed = await detectFreighter(2);
    if (!installed) return null;
    const allowed = await isAllowed();
    const isOk =
      typeof allowed === "boolean"
        ? allowed
        : Boolean((allowed as { isAllowed?: boolean }).isAllowed);
    if (!isOk) return null;
    const addressResult = await getAddress();
    if (typeof addressResult === "string") return addressResult;
    return (addressResult as { address?: string }).address ?? null;
  } catch {
    return null;
  }
}

export async function getFreighterNetwork(): Promise<{
  network: string;
  networkPassphrase: string;
}> {
  try {
    const details = await getNetworkDetails();
    if (details && typeof details === "object" && "networkPassphrase" in details) {
      return {
        network: String((details as { network: string }).network),
        networkPassphrase: String((details as { networkPassphrase: string }).networkPassphrase),
      };
    }
  } catch {
    // fall through
  }
  const net = await getNetwork();
  if (typeof net === "string") {
    return { network: net, networkPassphrase: stellarConfig.networkPassphrase };
  }
  return {
    network: String((net as { network?: string }).network ?? "UNKNOWN"),
    networkPassphrase: String(
      (net as { networkPassphrase?: string }).networkPassphrase ?? stellarConfig.networkPassphrase,
    ),
  };
}

export async function assertCorrectNetwork(): Promise<void> {
  const { networkPassphrase, network } = await getFreighterNetwork();
  if (networkPassphrase !== stellarConfig.networkPassphrase) {
    throw new Error(
      `Wrong network: Freighter is on ${network}. Switch to ${stellarConfig.freighterNetwork}.`,
    );
  }
}

export async function signTxWithFreighter(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<string> {
  try {
    await assertCorrectNetwork();
    const signed = await signTransaction(xdr, {
      networkPassphrase: opts?.networkPassphrase ?? stellarConfig.networkPassphrase,
      address: opts?.address,
    });
    if (signed && typeof signed === "object" && "error" in signed && signed.error) {
      throw new Error(String(signed.error));
    }
    if (typeof signed === "string") return signed;
    const signedXdr = (signed as { signedTxXdr?: string }).signedTxXdr;
    if (!signedXdr) throw new Error("Freighter did not return a signed transaction");
    return signedXdr;
  } catch (e) {
    throw new Error(humanizeError(e));
  }
}
