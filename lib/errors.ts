/**
 * Maps Freighter / Soroban / network errors into user-understandable messages.
 * Never returns a bare "Something went wrong."
 */

export function humanizeError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : JSON.stringify(err);

  const msg = raw.toLowerCase();

  if (
    msg.includes("freighter is not installed") ||
    msg.includes("freighter not detected") ||
    msg.includes("not installed")
  ) {
    return "Freighter wallet is not installed. Install it from https://freighter.app and refresh.";
  }
  if (
    msg.includes("user rejected") ||
    msg.includes("rejected by user") ||
    msg.includes("user declined") ||
    msg.includes("cancelled") ||
    msg.includes("canceled")
  ) {
    return "Transaction cancelled in Freighter.";
  }
  if (msg.includes("wrong network") || msg.includes("network mismatch") || msg.includes("incorrect network")) {
    return "Wrong network selected in Freighter. Switch to the network configured for StoryFund.";
  }
  if (msg.includes("insufficient balance") || msg.includes("insufficient funds")) {
    return "Insufficient token balance to fund this action.";
  }
  if (msg.includes("insufficient escrow") || msg.includes("#12")) {
    return "Escrow does not hold enough funds for this payout.";
  }
  if (msg.includes("already paid") || msg.includes("#11")) {
    return "This user story has already been paid. Double payout is blocked.";
  }
  if (msg.includes("unauthorized") || msg.includes("#3")) {
    return "Your wallet is not authorized for this action.";
  }
  if (msg.includes("invalid state") || msg.includes("#6")) {
    return "Invalid state transition. The story or project cannot move to that status.";
  }
  if (msg.includes("project not found") || msg.includes("#4")) {
    return "Project not found on-chain.";
  }
  if (msg.includes("story not found") || msg.includes("#5")) {
    return "User story not found on-chain.";
  }
  if (msg.includes("disputed") || msg.includes("#14")) {
    return "This story is disputed. Funds stay locked until resolution.";
  }
  if (msg.includes("review window") || msg.includes("#15")) {
    return "The review window is still open. Wait until it expires or ask the client to approve.";
  }
  if (msg.includes("invalid allocation") || msg.includes("#9")) {
    return "Developer allocations must sum to exactly 100%.";
  }
  if (msg.includes("already funded") || msg.includes("#10")) {
    return "This user story is already fully funded.";
  }
  if (msg.includes("no developers") || msg.includes("#13")) {
    return "Assign at least one developer before approving payout.";
  }
  if (msg.includes("network") && (msg.includes("unavailable") || msg.includes("failed to fetch") || msg.includes("timeout"))) {
    return "Stellar network is unavailable. Check your connection and RPC URL.";
  }
  if (msg.includes("contract") && msg.includes("not")) {
    return "Contract ID is missing or invalid. Set NEXT_PUBLIC_CONTRACT_ID after deploying.";
  }
  if (msg.includes("failed to simulate") || msg.includes("simulation failed")) {
    return `Transaction simulation failed: ${raw}`;
  }

  return raw || "Transaction failed with an unknown error from the wallet or network.";
}
