# StoryFund Soroban contract

Build and test:

```bash
cargo test
rustup target add wasm32v1-none
cargo build --release --target wasm32v1-none
# or: stellar contract build
```

Deploy via `../scripts/deploy-contract.sh`.

Public entrypoints: `initialize`, `create_project`, `create_story`, `assign_developers`, `fund_stories`, `start_story`, `submit_story`, `begin_review`, `approve_story`, `auto_complete_story`, `dispute_story`, `resolve_dispute`, `set_resolver`, `cancel_story`, `cancel_project`, plus view methods.
