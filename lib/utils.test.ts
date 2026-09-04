import { describe, expect, it } from "vitest";
import { bpsToPercent, fromBaseUnits, toBaseUnits, boardColumn, shortenAddress } from "@/lib/utils";
import { humanizeError } from "@/lib/errors";
import { DEMO_PROJECT, stellarConfig, USDC_TESTNET } from "@/config/stellar";

describe("utils", () => {
  it("converts base units round-trip", () => {
    const base = toBaseUnits("1000");
    expect(base).toBe(1000n * 10n ** BigInt(stellarConfig.tokenDecimals));
    expect(fromBaseUnits(base, stellarConfig.tokenDecimals, 0)).toBe("1000");
  });

  it("formats bps", () => {
    expect(bpsToPercent(6000)).toBe("60%");
    expect(bpsToPercent(3333)).toBe("33.3%");
  });

  it("maps story board columns", () => {
    expect(boardColumn("Open")).toBe("backlog");
    expect(boardColumn("InProgress")).toBe("in_progress");
    expect(boardColumn("Submitted")).toBe("review");
    expect(boardColumn("Completed")).toBe("completed");
  });

  it("shortens addresses", () => {
    expect(shortenAddress("GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD")).toMatch(/…/);
  });
});

describe("error handling", () => {
  it("explains freighter missing", () => {
    expect(humanizeError(new Error("Freighter is not installed"))).toMatch(/freighter.app/i);
  });

  it("explains user rejection", () => {
    expect(humanizeError(new Error("User rejected the request"))).toMatch(/cancelled/i);
  });

  it("explains already paid", () => {
    expect(humanizeError(new Error("Error(Contract, #11)"))).toMatch(/already been paid/i);
  });

  it("explains unauthorized", () => {
    expect(humanizeError(new Error("Error(Contract, #3)"))).toMatch(/not authorized/i);
  });

  it("never returns empty generic only", () => {
    const msg = humanizeError(new Error("simulation exploded XYZ"));
    expect(msg.length).toBeGreaterThan(5);
    expect(msg).not.toBe("Something went wrong.");
  });
});

describe("config", () => {
  it("defaults to testnet presets", () => {
    expect(stellarConfig.network).toBe("testnet");
    expect(stellarConfig.networkPassphrase).toContain("Test SDF");
    expect(USDC_TESTNET.startsWith("C")).toBe(true);
  });

  it("demo project budgets sum to 10000", () => {
    const sum = DEMO_PROJECT.stories.reduce((a, s) => a + s.budget, 0);
    expect(sum).toBe(10000);
  });
});

describe("transaction phase labels", () => {
  it("defines expected phases", () => {
    const phases = [
      "idle",
      "preparing",
      "awaiting_signature",
      "submitted",
      "confirming",
      "confirmed",
      "failed",
    ];
    expect(phases).toHaveLength(7);
  });
});
