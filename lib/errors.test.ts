import { describe, expect, it, vi, beforeEach } from "vitest";
import { humanizeError } from "@/lib/errors";

describe("wallet error surfaces", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("maps wrong network", () => {
    expect(humanizeError(new Error("Wrong network: Freighter is on PUBLIC"))).toMatch(/Wrong network/i);
  });

  it("maps insufficient balance", () => {
    expect(humanizeError(new Error("insufficient balance for operation"))).toMatch(/Insufficient token/i);
  });

  it("maps invalid state", () => {
    expect(humanizeError("Error(Contract, #6)")).toMatch(/Invalid state/i);
  });

  it("maps disputed", () => {
    expect(humanizeError("Error(Contract, #14)")).toMatch(/disputed/i);
  });

  it("maps network unavailable", () => {
    expect(humanizeError(new Error("Failed to fetch: network unavailable"))).toMatch(/unavailable/i);
  });
});
