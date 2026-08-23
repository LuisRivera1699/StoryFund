"use client";

import {
  isConnected,
  isAllowed,
  setAllowed,
  getAddress,
  getNetwork,
  getNetworkDetails,
  signTransaction,
} from "@stellar/freighter-api";
import { stellarConfig } from "@/config/stellar";
import { humanizeError } from "@/lib/errors";

export async function detectFreighter(): Promise<boolean> {
  try {
    const result = await isConnected();
    // freighter-api returns { isConnected: boolean } or boolean depending on version
    if (typeof result === "boolean") return result;
    if (result && typeof result === "object" && "isConnected" in result) {
      return Boolean((result as { isConnected: boolean }).isConnected);
    }
    return false;
  } catch {
    return false;
  }
}

export async function connectFreighter(): Promise<string> {
  const installed = await detectFreighter();
  if (!installed) {
    throw new Error("Freighter is not installed");
  }

  const allowed = await setAllowed();
  if (allowed && typeof allowed === "object" && "error" in allowed && allowed.error) {
    throw new Error(String(allowed.error));
  }

  const addressResult = await getAddress();
  if (addressResult && typeof addressResult === "object" && "error" in addressResult && addressResult.error) {
    throw new Error(String(addressResult.error));
  }
  const address =
    typeof addressResult === "string"
      ? addressResult
      : (addressResult as { address?: string }).address;
  if (!address) throw new Error("Could not read Freighter address");

  await assertCorrectNetwork();
  return address;
}

export async function getFreighterAddress(): Promise<string | null> {
  try {
    const installed = await detectFreighter();
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
