use soroban_sdk::{contracttype, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProjectStatus {
    Draft = 0,
    Funding = 1,
    Active = 2,
    Completed = 3,
    Cancelled = 4,
    Disputed = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StoryStatus {
    Open = 0,
    Funded = 1,
    InProgress = 2,
    Submitted = 3,
    UnderReview = 4,
    Completed = 5,
    Disputed = 6,
    Cancelled = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub token: Address,
    pub default_review_window: u64,
    pub next_project_id: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    pub project_id: u32,
    pub owner: Address,
    pub title: String,
    pub description: String,
    pub created_at: u64,
    pub status: ProjectStatus,
    pub total_budget: i128,
    pub funded_amount: i128,
    pub locked_amount: i128,
    pub released_amount: i128,
    pub review_window: u64,
    pub next_story_id: u32,
    pub story_count: u32,
    /// Dispute resolver — defaults to owner. Future: DAO / multisig / third-party.
    pub resolver: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Story {
    pub story_id: u32,
    pub project_id: u32,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: String,
    pub budget: i128,
    pub funded_amount: i128,
    pub status: StoryStatus,
    pub created_at: u64,
    pub completed_at: u64,
    pub submitted_at: u64,
    pub review_deadline: u64,
    pub github_url: String,
    /// Irreversible payout flag — primary double-payout protection.
    pub paid: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Allocation {
    pub developer: Address,
    /// Basis points; all allocations for a story must sum to 10_000.
    pub share_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectStats {
    pub project_id: u32,
    pub total_budget: i128,
    pub funded: i128,
    pub locked: i128,
    pub released: i128,
    pub remaining: i128,
    pub status: ProjectStatus,
    pub story_count: u32,
}
