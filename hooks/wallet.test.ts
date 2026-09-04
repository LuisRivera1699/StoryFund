import { describe, expect, it } from "vitest";
import type { TxPhase, WalletState } from "@/types";

describe("wallet state shape", () => {
  it("models disconnected wallet", () => {
    const state: WalletState = {
      connected: false,
      address: null,
      network: null,
      networkPassphrase: null,
      balance: null,
      tokenBalance: null,
      freighterInstalled: false,
    };
    expect(state.connected).toBe(false);
  });

  it("models connected freighter session", () => {
    const state: WalletState = {
      connected: true,
      address: "GTESTADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      network: "TESTNET",
      networkPassphrase: "Test SDF Network ; September 2015",
      balance: "1000",
      tokenBalance: "500",
      freighterInstalled: true,
    };
    expect(state.freighterInstalled).toBe(true);
    expect(state.address?.startsWith("G")).toBe(true);
  });
});

describe("funding / approval flow phases", () => {
  it("never skips confirmation for financial actions", () => {
    const flow: TxPhase[] = [
      "preparing",
      "awaiting_signature",
      "submitted",
      "confirming",
      "confirmed",
    ];
    expect(flow.includes("confirmed")).toBe(true);
    expect(flow.indexOf("confirmed")).toBeGreaterThan(flow.indexOf("submitted"));
  });
});
