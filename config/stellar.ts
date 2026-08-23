/**
 * Centralized Stellar / Soroban network configuration.
 * Switch Testnet ↔ Mainnet by changing NEXT_PUBLIC_STELLAR_NETWORK
 * (and related env vars). Never scatter these values across the app.
 */

export type StellarNetwork = "testnet" | "mainnet";

export interface NetworkConfig {
  network: StellarNetwork;
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  contractId: string;
  tokenContractId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  explorerBaseUrl: string;
  freighterNetwork: "TESTNET" | "PUBLIC";
}

const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet") as StellarNetwork;

const PRESETS: Record<StellarNetwork, Omit<NetworkConfig, "contractId" | "tokenContractId">> = {
  testnet: {
    network: "testnet",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
    tokenSymbol: "USDC",
    tokenDecimals: 7,
    explorerBaseUrl: "https://stellar.expert/explorer/testnet",
    freighterNetwork: "TESTNET",
  },
  mainnet: {
    network: "mainnet",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://mainnet.sorobanrpc.com",
    horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org",
    tokenSymbol: "USDC",
    tokenDecimals: 7,
    explorerBaseUrl: "https://stellar.expert/explorer/public",
    freighterNetwork: "PUBLIC",
  },
};

/** Circle USDC SAC on Stellar Testnet */
export const USDC_TESTNET =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

/** Circle USDC SAC on Stellar Mainnet */
export const USDC_MAINNET =
  "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

function resolveTokenContractId(network: StellarNetwork): string {
  if (process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID) {
    return process.env.NEXT_PUBLIC_TOKEN_CONTRACT_ID;
  }
  return network === "mainnet" ? USDC_MAINNET : USDC_TESTNET;
}

export const stellarConfig: NetworkConfig = {
  ...PRESETS[NETWORK],
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "",
  tokenContractId: resolveTokenContractId(NETWORK),
};

export function explorerTxUrl(hash: string): string {
  return `${stellarConfig.explorerBaseUrl}/tx/${hash}`;
}

export function explorerAccountUrl(address: string): string {
  return `${stellarConfig.explorerBaseUrl}/account/${address}`;
}

export function explorerContractUrl(id: string): string {
  return `${stellarConfig.explorerBaseUrl}/contract/${id}`;
}

export const DEFAULT_REVIEW_WINDOW_SECONDS = 48 * 60 * 60;

export const DEMO_PROJECT = {
  title: "Build an ecommerce website",
  description:
    "Full-stack ecommerce MVP: auth, catalog, cart, checkout, and payments.",
  stories: [
    { title: "Authentication", description: "Email/password + session auth", budget: 1000, acceptance: "Users can register, login, logout securely" },
    { title: "Product catalog", description: "Browse and search products", budget: 2000, acceptance: "Catalog lists products with filters" },
    { title: "Shopping cart", description: "Add/remove items, persist cart", budget: 1500, acceptance: "Cart updates totals correctly" },
    { title: "Checkout", description: "Address + order summary flow", budget: 2500, acceptance: "Order is created with valid totals" },
    { title: "Payments", description: "Payment provider integration", budget: 3000, acceptance: "Successful payment marks order paid" },
  ],
} as const;
