# StoryFund Architecture

## Principle

**Soroban is the source of truth.** The Next.js app is an interface. There is no custodial backend and no database of balances, ownership, or payout state.

```
CLIENT WALLET → SOROBAN ESCROW → VERIFIED WORK → DEVELOPER WALLETS
```

## Components

| Layer | Role |
| --- | --- |
| `contracts/` | Single Soroban contract (`StoryFund`) — projects, stories, escrow, allocations, disputes, payouts |
| `app/` + `components/` | UX: Linear/Jira-style project board + Freighter flows |
| `lib/` | Stellar RPC/Horizon clients, contract helpers, tx pipeline |
| `config/stellar.ts` | Network, RPC, Horizon, contract IDs, token, explorer — single switch Testnet↔Mainnet |
| Local storage | Optional UX index of project IDs + tx hashes seen in this browser. Never trusted for funds. |

## Smart contract (MVP: one contract)

Separated by module, single deployable for simplicity and audit surface:

- **Project management** — create, status, cancel, stats
- **Story management** — create, state machine, GitHub URL (evidence only)
- **Funding / escrow** — `fund_stories` pulls SEP-41 token into the contract; per-story accounting
- **Allocations** — developer addresses + basis points (must sum to 10_000)
- **Verification** — submit → review window → owner approve / dispute / auto-complete
- **Payout** — checks-effects-interactions; `paid` flag; remainder to last developer
- **Disputes** — funds stay locked; `resolver` (default owner) can approve payout or refund

### State machines

**Project:** `Draft → Funding → Active → Completed | Cancelled` (+ `Disputed` while a story is disputed)

**Story:** `Open → Funded → InProgress → Submitted → UnderReview → Completed`  
Also: `Disputed`, `Cancelled`

### Authorization

| Action | Auth |
| --- | --- |
| create_project | caller (becomes owner) |
| create_story / assign / fund / approve / dispute / cancel | project owner |
| start / submit | assigned developer |
| auto_complete | anyone, after on-chain `review_deadline` |
| resolve_dispute | project `resolver` |
| token transfer into escrow | funder (owner) via token auth |
| token transfer out | contract (holds escrow); no admin key |

There is **no** privileged admin that can arbitrarily withdraw escrow.

### Token

Configured at `initialize(token, default_review_window)`. MVP uses Circle **USDC SAC** on Testnet (`CBIELTK6…`). Asset is abstracted — any SEP-41 token works by changing env + re-init on a fresh deploy.

### Review window

Stored as ledger timestamp seconds. On submit: `review_deadline = now + project.review_window`. Frontend clocks are irrelevant for `auto_complete_story`.

### Events

Published for indexer-ready pipelines: project/story create & fund, developer assign, start/submit/approve/dispute, payment released, project completed/cancelled.

### Future extensions (prepared, not built)

- **Arbitration:** `set_resolver` already allows pointing at a multisig/DAO/third-party contract account.
- **Reputation:** off-chain indexer over events (`PAYMENT_RELEASED`, disputes). Types reserved conceptually in docs; no fake stats in UI.
- **Split contracts:** escrow could be extracted if gas/ACL complexity grows.

## Frontend transaction UX

```
Preparing → Waiting for Freighter → Submitted → Confirming → Confirmed
```

Financial UI updates **only after** RPC confirmation. No optimistic “Funded” badges.

## Network switch

Set `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` and the Mainnet RPC/Horizon/token/contract IDs. All code reads `stellarConfig` — no scattered passphrases.

## Security decisions

1. Prefer one audited-size contract over premature multi-contract complexity.
2. Mark `paid` before token transfers to block double payout on reentry/retry.
3. Allocation sum enforced on-chain at 10_000 bps.
4. Rounding dust goes to the last developer so escrow does not retain unpaid remainder.
5. GitHub URLs never gate payout.
6. Deploy keys stay in shell env for scripts only — never in `NEXT_PUBLIC_*`.

See README **Security considerations** for known MVP limits.
