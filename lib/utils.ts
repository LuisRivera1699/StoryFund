import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { stellarConfig } from "@/config/stellar";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** Convert human amount (e.g. "100.5") to token base units (bigint). */
export function toBaseUnits(amount: string | number, decimals = stellarConfig.tokenDecimals): bigint {
  const str = typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
  if (!str || Number.isNaN(Number(str))) throw new Error("Invalid amount");
  const [whole, frac = ""] = str.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const negative = whole.startsWith("-");
  const w = negative ? whole.slice(1) : whole;
  const value = BigInt(w || "0") * BigInt(10 ** decimals) + BigInt(padded || "0");
  return negative ? -value : value;
}

/** Format base units to human-readable string. */
export function fromBaseUnits(
  amount: bigint | number | string,
  decimals = stellarConfig.tokenDecimals,
  displayDecimals = 2,
): string {
  const v = typeof amount === "bigint" ? amount : BigInt(amount);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, displayDecimals);
  const result = displayDecimals > 0 ? `${whole}.${fracStr}` : whole.toString();
  return neg ? `-${result}` : result;
}

export function formatToken(amount: bigint | number | string, symbol = stellarConfig.tokenSymbol): string {
  return `${fromBaseUnits(amount)} ${symbol}`;
}

export function formatUsdLike(amount: bigint | number | string): string {
  const n = Number(fromBaseUnits(amount));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatTimestamp(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

export function boardColumn(status: string): "backlog" | "in_progress" | "review" | "completed" {
  switch (status) {
    case "Open":
    case "Funded":
      return "backlog";
    case "InProgress":
      return "in_progress";
    case "Submitted":
    case "UnderReview":
    case "Disputed":
      return "review";
    case "Completed":
    case "Cancelled":
      return "completed";
    default:
      return "backlog";
  }
}
