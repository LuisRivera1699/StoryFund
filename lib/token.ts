import { getHorizon, getRpc } from "@/lib/contract";
import { stellarConfig } from "@/config/stellar";
import { fromBaseUnits } from "@/lib/utils";
import * as StellarSdk from "@stellar/stellar-sdk";

export async function getXlmBalance(address: string): Promise<string> {
  try {
    const horizon = getHorizon();
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native?.balance ?? "0";
  } catch {
    return "0";
  }
}

export async function getTokenBalance(address: string): Promise<string> {
  try {
    const server = getRpc();
    const contract = new StellarSdk.Contract(stellarConfig.tokenContractId);
    // Use simulation of balance(address)
    let source: StellarSdk.Account;
    try {
      source = await server.getAccount(address);
    } catch {
      source = new StellarSdk.Account(address, "0");
    }
    const tx = new StellarSdk.TransactionBuilder(source, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(
        contract.call("balance", StellarSdk.Address.fromString(address).toScVal()),
      )
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const val = StellarSdk.scValToNative(sim.result.retval);
      return fromBaseUnits(BigInt(val));
    }
    return "0";
  } catch {
    return "0";
  }
}

/**
 * Build token approve so the StoryFund contract can pull funds via transfer
 * in fund_stories (which calls token.transfer from the funder — requires funder auth,
 * not approve). Our contract uses token.transfer(&funder, &contract, &amount) which
 * needs funder.require_auth — Freighter will co-authorize. No separate approve needed.
 */
export async function ensureTokenTrustlineHint(): Promise<string> {
  return `Ensure your Freighter account holds ${stellarConfig.tokenSymbol} on ${stellarConfig.network} and can authorize the transfer into escrow.`;
}
