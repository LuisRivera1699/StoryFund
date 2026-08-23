#![no_std]
#![allow(clippy::too_many_arguments)]

mod error;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod test;

use error::Error;
use events::*;
use soroban_sdk::{
    contract, contractimpl, token, Address, Env, String, Vec,
};
use storage::*;
use types::*;

pub use error::*;
pub use types::*;

/// StoryFund escrow: client funds → locked on-chain → verified work → payout.
///
/// No admin wallet can move funds arbitrarily. All fund movements require
/// on-chain authorization and valid state transitions.
#[contract]
pub struct StoryFund;

#[contractimpl]
impl StoryFund {
    /// One-time initialization. Sets the SEP-41 token used for escrow and the
    /// default review window (seconds) applied when a project does not override it.
    pub fn initialize(env: Env, token: Address, default_review_window: u64) {
        if has_config(&env) {
            panic_err(&env, Error::AlreadyInitialized);
        }
        if default_review_window == 0 {
            panic_err(&env, Error::InvalidInput);
        }
        set_config(
            &env,
            &Config {
                token,
                default_review_window,
                next_project_id: 1,
            },
        );
    }

    /// Create a project. Caller becomes the owner/client.
    pub fn create_project(
        env: Env,
        owner: Address,
        title: String,
        description: String,
        review_window: Option<u64>,
    ) -> u32 {
        owner.require_auth();
        let mut cfg = require_config(&env);
        validate_title(&env, &title);
        validate_description(&env, &description);

        let window = review_window.unwrap_or(cfg.default_review_window);
        if window == 0 {
            panic_err(&env, Error::InvalidInput);
        }

        let project_id = cfg.next_project_id;
        cfg.next_project_id = project_id
            .checked_add(1)
            .unwrap_or_else(|| panic_err(&env, Error::Overflow));
        set_config(&env, &cfg);

        let now = env.ledger().timestamp();
        let project = Project {
            project_id,
            owner: owner.clone(),
            title: title.clone(),
            description,
            created_at: now,
            status: ProjectStatus::Draft,
            total_budget: 0,
            funded_amount: 0,
            locked_amount: 0,
            released_amount: 0,
            review_window: window,
            next_story_id: 1,
            story_count: 0,
            resolver: owner.clone(), // MVP: owner resolves disputes; extensible later
        };
        set_project(&env, &project);
        set_owner_project(&env, &owner, project_id);

        emit_project_created(&env, project_id, &owner, &title);
        project_id
    }

    /// Create a user story (HU) under a project. Only the project owner.
    pub fn create_story(
        env: Env,
        project_id: u32,
        title: String,
        description: String,
        acceptance_criteria: String,
        budget: i128,
        github_url: String,
    ) -> u32 {
        let mut project = require_project(&env, project_id);
        project.owner.require_auth();
        assert_project_mutable(&env, &project);
        validate_title(&env, &title);
        validate_description(&env, &description);
        if budget <= 0 {
            panic_err(&env, Error::InvalidBudget);
        }

        let story_id = project.next_story_id;
        project.next_story_id = story_id
            .checked_add(1)
            .unwrap_or_else(|| panic_err(&env, Error::Overflow));
        project.story_count = project
            .story_count
            .checked_add(1)
            .unwrap_or_else(|| panic_err(&env, Error::Overflow));
        project.total_budget = project
            .total_budget
            .checked_add(budget)
            .unwrap_or_else(|| panic_err(&env, Error::Overflow));

        if project.status == ProjectStatus::Draft {
            project.status = ProjectStatus::Funding;
        }

        let now = env.ledger().timestamp();
        let story = Story {
            story_id,
            project_id,
            title: title.clone(),
            description,
            acceptance_criteria,
            budget,
            funded_amount: 0,
            status: StoryStatus::Open,
            created_at: now,
            completed_at: 0,
            submitted_at: 0,
            review_deadline: 0,
            github_url,
            paid: false,
        };
        set_story(&env, project_id, &story);
        set_allocations(&env, project_id, story_id, &Vec::new(&env));
        set_project(&env, &project);

        emit_story_created(&env, project_id, story_id, &title, budget);
        story_id
    }

    /// Assign developers with allocation in basis points (must sum to 10_000 = 100%).
    pub fn assign_developers(
        env: Env,
        project_id: u32,
        story_id: u32,
        developers: Vec<Address>,
        shares_bps: Vec<u32>,
    ) {
        let project = require_project(&env, project_id);
        project.owner.require_auth();
        assert_project_mutable(&env, &project);

        let story = require_story(&env, project_id, story_id);
        if story.paid || story.status == StoryStatus::Completed {
            panic_err(&env, Error::InvalidState);
        }
        if story.status == StoryStatus::Cancelled {
            panic_err(&env, Error::InvalidState);
        }
        if developers.len() == 0 || developers.len() != shares_bps.len() {
            panic_err(&env, Error::InvalidAllocation);
        }
        if developers.len() > 10 {
            panic_err(&env, Error::InvalidAllocation);
        }

        let mut total_bps: u32 = 0;
        let mut allocations: Vec<Allocation> = Vec::new(&env);
        for i in 0..developers.len() {
            let addr = developers.get(i).unwrap();
            let bps = shares_bps.get(i).unwrap();
            if bps == 0 {
                panic_err(&env, Error::InvalidAllocation);
            }
            // Reject duplicate addresses
            for j in 0..i {
                if developers.get(j).unwrap() == addr {
                    panic_err(&env, Error::InvalidAllocation);
                }
            }
            total_bps = total_bps
                .checked_add(bps)
                .unwrap_or_else(|| panic_err(&env, Error::Overflow));
            allocations.push_back(Allocation {
                developer: addr.clone(),
                share_bps: bps,
            });
            emit_developer_assigned(&env, project_id, story_id, &addr, bps);
        }
        if total_bps != 10_000 {
            panic_err(&env, Error::InvalidAllocation);
        }

        set_allocations(&env, project_id, story_id, &allocations);
    }

    /// Fund one or more stories in a single transaction.
    /// Transfers tokens from `funder` into the contract escrow.
    pub fn fund_stories(env: Env, project_id: u32, story_ids: Vec<u32>, funder: Address) {
        funder.require_auth();
        let mut project = require_project(&env, project_id);
        if project.owner != funder {
            panic_err(&env, Error::Unauthorized);
        }
        assert_project_fundable(&env, &project);
        if story_ids.len() == 0 {
            panic_err(&env, Error::InvalidInput);
        }

        let cfg = require_config(&env);
        let token = token::Client::new(&env, &cfg.token);
        let contract_addr = env.current_contract_address();

        let mut total_transfer: i128 = 0;
        for i in 0..story_ids.len() {
            let sid = story_ids.get(i).unwrap();
            // Deduplicate within the call
            for j in 0..i {
                if story_ids.get(j).unwrap() == sid {
                    panic_err(&env, Error::InvalidInput);
                }
            }
            let mut story = require_story(&env, project_id, sid);
            if story.status != StoryStatus::Open && story.status != StoryStatus::Funded {
                panic_err(&env, Error::InvalidState);
            }
            let remaining = story
                .budget
                .checked_sub(story.funded_amount)
                .unwrap_or_else(|| panic_err(&env, Error::Overflow));
            if remaining <= 0 {
                panic_err(&env, Error::AlreadyFunded);
            }
            total_transfer = total_transfer
                .checked_add(remaining)
                .unwrap_or_else(|| panic_err(&env, Error::Overflow));

            story.funded_amount = story.budget;
            story.status = StoryStatus::Funded;
            set_story(&env, project_id, &story);

            project.funded_amount = project
                .funded_amount
                .checked_add(remaining)
                .unwrap_or_else(|| panic_err(&env, Error::Overflow));
            project.locked_amount = project
                .locked_amount
                .checked_add(remaining)
                .unwrap_or_else(|| panic_err(&env, Error::Overflow));

            emit_story_funded(&env, project_id, sid, remaining, &funder);
        }

        // Pull funds into escrow after accounting is prepared
        token.transfer(&funder, &contract_addr, &total_transfer);

        if project.status == ProjectStatus::Draft || project.status == ProjectStatus::Funding {
            project.status = ProjectStatus::Active;
        }
        set_project(&env, &project);
        emit_project_funded(&env, project_id, total_transfer, &funder);
    }

    /// Assigned developer starts work on a funded story.
    pub fn start_story(env: Env, project_id: u32, story_id: u32, developer: Address) {
        developer.require_auth();
        let project = require_project(&env, project_id);
        assert_project_active(&env, &project);
        let mut story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Funded && story.status != StoryStatus::Open {
            panic_err(&env, Error::InvalidState);
        }
        if story.funded_amount < story.budget {
            panic_err(&env, Error::InsufficientEscrow);
        }
        require_assigned_developer(&env, project_id, story_id, &developer);

        story.status = StoryStatus::InProgress;
        set_story(&env, project_id, &story);
        emit_story_started(&env, project_id, story_id, &developer);
    }

    /// Assigned developer submits work for review. Starts the review window.
    pub fn submit_story(env: Env, project_id: u32, story_id: u32, developer: Address) {
        developer.require_auth();
        let project = require_project(&env, project_id);
        assert_project_active(&env, &project);
        let mut story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::InProgress {
            panic_err(&env, Error::InvalidState);
        }
        require_assigned_developer(&env, project_id, story_id, &developer);

        let now = env.ledger().timestamp();
        story.status = StoryStatus::Submitted;
        story.submitted_at = now;
        story.review_deadline = now
            .checked_add(project.review_window)
            .unwrap_or_else(|| panic_err(&env, Error::Overflow));
        set_story(&env, project_id, &story);
        emit_story_submitted(&env, project_id, story_id, &developer, story.review_deadline);
    }

    /// Move submitted story into under-review (optional explicit step by owner).
    pub fn begin_review(env: Env, project_id: u32, story_id: u32) {
        let project = require_project(&env, project_id);
        project.owner.require_auth();
        assert_project_active(&env, &project);
        let mut story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Submitted {
            panic_err(&env, Error::InvalidState);
        }
        story.status = StoryStatus::UnderReview;
        set_story(&env, project_id, &story);
    }

    /// Owner approves a submitted/under-review story and releases escrowed payment.
    pub fn approve_story(env: Env, project_id: u32, story_id: u32) {
        let project = require_project(&env, project_id);
        project.owner.require_auth();
        let story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Submitted && story.status != StoryStatus::UnderReview {
            panic_err(&env, Error::InvalidState);
        }
        Self::release_payout(&env, project_id, story_id);
    }

    /// Anyone may trigger auto-complete after the review window expires without dispute.
    pub fn auto_complete_story(env: Env, project_id: u32, story_id: u32) {
        let story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Submitted && story.status != StoryStatus::UnderReview {
            panic_err(&env, Error::InvalidState);
        }
        let now = env.ledger().timestamp();
        if now < story.review_deadline {
            panic_err(&env, Error::ReviewWindowOpen);
        }
        Self::release_payout(&env, project_id, story_id);
    }

    /// Owner disputes a submitted story. Funds remain locked; no payout.
    pub fn dispute_story(env: Env, project_id: u32, story_id: u32) {
        let mut project = require_project(&env, project_id);
        project.owner.require_auth();
        assert_project_active(&env, &project);
        let mut story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Submitted
            && story.status != StoryStatus::UnderReview
            && story.status != StoryStatus::InProgress
        {
            panic_err(&env, Error::InvalidState);
        }
        if story.paid {
            panic_err(&env, Error::AlreadyPaid);
        }
        story.status = StoryStatus::Disputed;
        set_story(&env, project_id, &story);
        project.status = ProjectStatus::Disputed;
        set_project(&env, &project);
        emit_story_disputed(&env, project_id, story_id, &project.owner);
    }

    /// Resolve a dispute. MVP: only the configured resolver (defaults to owner).
    /// `approve = true` → payout; `approve = false` → cancel story and refund owner.
    pub fn resolve_dispute(env: Env, project_id: u32, story_id: u32, approve: bool) {
        let project = require_project(&env, project_id);
        project.resolver.require_auth();
        let story = require_story(&env, project_id, story_id);
        if story.status != StoryStatus::Disputed {
            panic_err(&env, Error::InvalidState);
        }
        if approve {
            Self::release_payout(&env, project_id, story_id);
        } else {
            Self::refund_story_internal(&env, project_id, story_id);
        }
    }

    /// Set a custom dispute resolver (owner only). Enables future multisig/DAO/third-party.
    pub fn set_resolver(env: Env, project_id: u32, resolver: Address) {
        let mut project = require_project(&env, project_id);
        project.owner.require_auth();
        project.resolver = resolver;
        set_project(&env, &project);
    }

    /// Cancel an open/funded story and refund locked amount to owner (if funded).
    pub fn cancel_story(env: Env, project_id: u32, story_id: u32) {
        let project = require_project(&env, project_id);
        project.owner.require_auth();
        let story = require_story(&env, project_id, story_id);
        if story.paid || story.status == StoryStatus::Completed {
            panic_err(&env, Error::InvalidState);
        }
        if story.status == StoryStatus::Disputed {
            panic_err(&env, Error::Disputed);
        }
        if story.status == StoryStatus::Submitted || story.status == StoryStatus::UnderReview {
            panic_err(&env, Error::InvalidState);
        }
        Self::refund_story_internal(&env, project_id, story_id);
    }

    /// Cancel the whole project. Refunds all non-paid locked story funds to owner.
    pub fn cancel_project(env: Env, project_id: u32) {
        let mut project = require_project(&env, project_id);
        project.owner.require_auth();
        if project.status == ProjectStatus::Completed || project.status == ProjectStatus::Cancelled
        {
            panic_err(&env, Error::InvalidState);
        }

        for sid in 1..project.next_story_id {
            if let Some(story) = get_story(&env, project_id, sid) {
                if !story.paid
                    && story.status != StoryStatus::Completed
                    && story.status != StoryStatus::Cancelled
                    && story.funded_amount > 0
                {
                    Self::refund_story_internal(&env, project_id, sid);
                } else if !story.paid
                    && story.status != StoryStatus::Completed
                    && story.status != StoryStatus::Cancelled
                {
                    let mut s = story;
                    s.status = StoryStatus::Cancelled;
                    set_story(&env, project_id, &s);
                }
            }
        }

        // Reload after refunds
        project = require_project(&env, project_id);
        project.status = ProjectStatus::Cancelled;
        set_project(&env, &project);
        emit_project_cancelled(&env, project_id, &project.owner);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    pub fn get_config(env: Env) -> Config {
        require_config(&env)
    }

    pub fn get_project(env: Env, project_id: u32) -> Project {
        require_project(&env, project_id)
    }

    pub fn get_story(env: Env, project_id: u32, story_id: u32) -> Story {
        require_story(&env, project_id, story_id)
    }

    pub fn get_allocations(env: Env, project_id: u32, story_id: u32) -> Vec<Allocation> {
        get_allocations_or_empty(&env, project_id, story_id)
    }

    pub fn get_project_stats(env: Env, project_id: u32) -> ProjectStats {
        let project = require_project(&env, project_id);
        ProjectStats {
            project_id,
            total_budget: project.total_budget,
            funded: project.funded_amount,
            locked: project.locked_amount,
            released: project.released_amount,
            remaining: project
                .total_budget
                .checked_sub(project.funded_amount)
                .unwrap_or(0),
            status: project.status,
            story_count: project.story_count,
        }
    }

    pub fn next_project_id(env: Env) -> u32 {
        require_config(&env).next_project_id
    }

    // ─── Internal ────────────────────────────────────────────────────────

    fn release_payout(env: &Env, project_id: u32, story_id: u32) {
        let mut project = require_project(env, project_id);
        if project.status == ProjectStatus::Cancelled {
            panic_err(env, Error::InvalidState);
        }

        let mut story = require_story(env, project_id, story_id);

        // Double-payout / replay protection
        if story.paid {
            panic_err(env, Error::AlreadyPaid);
        }
        // Valid statuses for payout (callers gate Disputed vs Submitted/UnderReview)
        match story.status {
            StoryStatus::Submitted
            | StoryStatus::UnderReview
            | StoryStatus::Disputed => {}
            StoryStatus::Completed | StoryStatus::Cancelled => {
                panic_err(env, Error::InvalidState)
            }
            _ => panic_err(env, Error::InvalidState),
        }

        if story.funded_amount < story.budget || story.budget <= 0 {
            panic_err(env, Error::InsufficientEscrow);
        }

        let allocations = get_allocations_or_empty(env, project_id, story_id);
        if allocations.len() == 0 {
            panic_err(env, Error::NoDevelopers);
        }

        // Mark paid BEFORE transfers (checks-effects-interactions)
        story.paid = true;
        story.status = StoryStatus::Completed;
        story.completed_at = env.ledger().timestamp();
        set_story(env, project_id, &story);

        let amount = story.budget;
        project.locked_amount = project
            .locked_amount
            .checked_sub(amount)
            .unwrap_or_else(|| panic_err(env, Error::InsufficientEscrow));
        project.released_amount = project
            .released_amount
            .checked_add(amount)
            .unwrap_or_else(|| panic_err(env, Error::Overflow));
        if project.status == ProjectStatus::Disputed {
            project.status = ProjectStatus::Active;
        }
        set_project(env, &project);

        let cfg = require_config(env);
        let token = token::Client::new(env, &cfg.token);
        let contract_addr = env.current_contract_address();

        // Distribute with remainder to last developer (no dust left in escrow)
        let mut distributed: i128 = 0;
        let n = allocations.len();
        for i in 0..n {
            let alloc = allocations.get(i).unwrap();
            let share = if i == n - 1 {
                amount
                    .checked_sub(distributed)
                    .unwrap_or_else(|| panic_err(env, Error::Overflow))
            } else {
                // amount * bps / 10_000
                let part = amount
                    .checked_mul(alloc.share_bps as i128)
                    .unwrap_or_else(|| panic_err(env, Error::Overflow))
                    / 10_000;
                distributed = distributed
                    .checked_add(part)
                    .unwrap_or_else(|| panic_err(env, Error::Overflow));
                part
            };
            if share > 0 {
                token.transfer(&contract_addr, &alloc.developer, &share);
                emit_payment_released(
                    env,
                    project_id,
                    story_id,
                    &alloc.developer,
                    share,
                );
            }
        }

        emit_story_approved(env, project_id, story_id, &project.owner, amount);

        // Mark project completed if all stories completed/cancelled
        Self::maybe_complete_project(env, project_id);
    }

    fn refund_story_internal(env: &Env, project_id: u32, story_id: u32) {
        let mut project = require_project(env, project_id);
        let mut story = require_story(env, project_id, story_id);

        if story.paid {
            panic_err(env, Error::AlreadyPaid);
        }
        if story.status == StoryStatus::Completed || story.status == StoryStatus::Cancelled {
            panic_err(env, Error::InvalidState);
        }

        let refund = story.funded_amount;
        story.funded_amount = 0;
        story.status = StoryStatus::Cancelled;
        set_story(env, project_id, &story);

        if refund > 0 {
            project.locked_amount = project
                .locked_amount
                .checked_sub(refund)
                .unwrap_or_else(|| panic_err(env, Error::InsufficientEscrow));
            project.funded_amount = project
                .funded_amount
                .checked_sub(refund)
                .unwrap_or_else(|| panic_err(env, Error::Overflow));
            set_project(env, &project);

            let cfg = require_config(env);
            let token = token::Client::new(env, &cfg.token);
            let contract_addr = env.current_contract_address();
            token.transfer(&contract_addr, &project.owner, &refund);
        } else {
            set_project(env, &project);
        }

        if project.status == ProjectStatus::Disputed {
            let mut p = require_project(env, project_id);
            p.status = ProjectStatus::Active;
            set_project(env, &p);
        }
    }

    fn maybe_complete_project(env: &Env, project_id: u32) {
        let mut project = require_project(env, project_id);
        if project.story_count == 0 {
            return;
        }
        for sid in 1..project.next_story_id {
            if let Some(story) = get_story(env, project_id, sid) {
                if story.status != StoryStatus::Completed
                    && story.status != StoryStatus::Cancelled
                {
                    return;
                }
            }
        }
        project.status = ProjectStatus::Completed;
        set_project(env, &project);
        emit_project_completed(env, project_id);
    }
}

fn panic_err(env: &Env, err: Error) -> ! {
    panic_with_error!(env, err);
}

use soroban_sdk::panic_with_error;

fn validate_title(env: &Env, title: &String) {
    if title.len() == 0 || title.len() > 128 {
        panic_err(env, Error::InvalidInput);
    }
}

fn validate_description(env: &Env, description: &String) {
    if description.len() > 1024 {
        panic_err(env, Error::InvalidInput);
    }
}

fn assert_project_mutable(env: &Env, project: &Project) {
    match project.status {
        ProjectStatus::Draft
        | ProjectStatus::Funding
        | ProjectStatus::Active
        | ProjectStatus::Disputed => {}
        _ => panic_err(env, Error::InvalidState),
    }
}

fn assert_project_fundable(env: &Env, project: &Project) {
    match project.status {
        ProjectStatus::Draft | ProjectStatus::Funding | ProjectStatus::Active => {}
        _ => panic_err(env, Error::InvalidState),
    }
}

fn assert_project_active(env: &Env, project: &Project) {
    if project.status != ProjectStatus::Active && project.status != ProjectStatus::Funding {
        panic_err(env, Error::InvalidState);
    }
}

fn require_assigned_developer(env: &Env, project_id: u32, story_id: u32, developer: &Address) {
    let allocations = get_allocations_or_empty(env, project_id, story_id);
    for i in 0..allocations.len() {
        if &allocations.get(i).unwrap().developer == developer {
            return;
        }
    }
    panic_err(env, Error::Unauthorized);
}
