# StoryFund

**Fund software development. Pay only for verified work.**

StoryFund is a Stellar/Soroban application where clients create software projects, attach budgets to User Stories (HUs), and lock funds in an on-chain escrow. Developers deliver work; when a story is approved, the smart contract releases payment according to on-chain allocations.

```
CLIENT DEPOSITS → FUNDS LOCKED → DEVELOPER WORKS → HU VALIDATED → CONTRACT RELEASES PAYMENT
```

Blockchain is the **source of truth**. The frontend never custodies funds and cannot move escrow without the authorizations enforced by the contract.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for modules, state machines, and design decisions.

```
/app            Next.js App Router pages
/components     UI (board, wallet, tx status)
/lib            Stellar SDK, contract calls, tx pipeline, errors
/hooks          Freighter wallet + transaction hooks
/config         Network / RPC / contract / token config
/contracts      Soroban smart contract (Rust) + unit tests
/scripts        Deploy helpers
/types          Shared TS types
```

## How it works

1. Client connects **Freighter** and creates a project on-chain.
2. Client adds User Stories with individual budgets and assigns developers (basis points).
3. Client **funds** one or many HUs — USDC (or configured SEP-41 token) transfers into the contract.
4. Developer **starts** work → **submits** for review (starts review window).
5. Client **approves** (payout) or **disputes** (funds stay locked).
6. After the review window, anyone may call **auto-complete** if still unrebutted.
7. Dispute resolver (defaults to owner; swappable via `set_resolver`) pays or refunds.

## Prerequisites

- Node.js 20+
- Rust 1.84+ with `wasm32v1-none` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/cli)
- [Freighter](https://www.freighter.app/) browser extension
- Testnet account funded with XLM + test USDC (trustline to Circle test USDC)

## Configure Stellar Testnet

```bash
cp .env.example .env.local
```

Defaults:

| Variable | Testnet default |
| --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_TOKEN_CONTRACT_ID` | Circle USDC SAC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| `NEXT_PUBLIC_CONTRACT_ID` | *(set after deploy)* |

## Install Freighter

1. Install from [freighter.app](https://www.freighter.app/)
2. Create or import a Testnet account
3. Switch Freighter network to **Testnet**
4. Fund via Friendbot; add USDC trustline / obtain test USDC as needed

StoryFund never asks for or stores private keys.

## Deploy the contract

```bash
# Install wasm target
rustup target add wasm32v1-none

# Fund a Testnet key locally (DO NOT commit)
export STELLAR_SECRET_KEY=S...
chmod +x scripts/deploy-contract.sh
./scripts/deploy-contract.sh
```

The script builds, uploads, deploys, and calls `initialize(token, review_window)`.

Then set:

```bash
NEXT_PUBLIC_CONTRACT_ID=C...
```

### Manual build / test (contract)

```bash
cd contracts
cargo test
# Build wasm (preferred via stellar CLI):
stellar contract build
```

## Run the app locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → Connect Freighter → Create project (or load the ecommerce demo template).

## Tests

```bash
# Smart contract (Rust)
npm run test:contracts
# or: cd contracts && cargo test

# Frontend unit tests
npm test

# Typecheck + production build
npm run typecheck
npm run build
```

Contract coverage includes: create project/HU, fund, assign, submit, approve, multi-dev splits, rounding remainder, unauthorized start, double payout, dispute + resolve, auto-complete window, cancel/refund, invalid allocation, invalid transitions.

## Switch Testnet → Mainnet

1. Deploy the contract to Mainnet.
2. Update `.env.local`:

```bash
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://mainnet.sorobanrpc.com
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_CONTRACT_ID=C...
NEXT_PUBLIC_TOKEN_CONTRACT_ID=CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
```

3. Use Freighter on **Public** network. All explorer links and passphrases come from `config/stellar.ts`.

## Demo template

On **New project**, use **Load demo template**:

- Build an ecommerce website — $10,000 across Auth, Catalog, Cart, Checkout, Payments

Funding still requires a real Freighter signature and on-chain USDC. The UI never fakes a “Funded” state.

## Security considerations

### Guarantees (MVP)

- Escrow only moves via contract methods with `require_auth` on the right parties.
- Double payout blocked by irreversible `paid` + status checks (effects before transfers).
- Allocations must sum to 100% (10_000 bps) on-chain.
- No server private key can drain escrow.
- No admin withdraw function.

### Review checklist performed

| Risk | Mitigation |
| --- | --- |
| Unauthorized withdrawal | No generic withdraw; payouts only through approve/auto-complete/resolve |
| Privilege escalation | Owner/resolver/developer roles checked per method |
| Double payout | `paid` flag + Completed status |
| Allocation manipulation | Sum validation; duplicates rejected |
| Refund bugs | Cancel/dispute-refund only if `!paid` |
| Rounding | Remainder to last developer |
| Replay | State transitions reject Completed/paid stories |
| Token confusion | Token fixed at initialize |

### Known MVP limitations

- Dispute resolver defaults to the project owner (centralized for MVP). Use `set_resolver` for multisig/DAO later — architecture is ready, arbitration UI is not.
- Long metadata is stored on-chain with length caps; very large docs should move to content hashes later.
- Project ID discovery for the UI uses a **local** browser index plus `next_project_id` after create — not a global indexer. Anyone can open `/projects/{id}` if they know the id.
- Events still use the legacy `events().publish` API (deprecated in SDK 27 in favor of `#[contractevent]`); functionally fine for MVP.
- Automatic completion requires someone to call `auto_complete_story` after the window (permissionless), not a protocol cron.
- Testnet USDC acquisition and trustlines are outside this repo.

**Do not use in production with real Mainnet funds without an independent security audit.**

## License

MIT
