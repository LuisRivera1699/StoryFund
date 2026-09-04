use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ProjectNotFound = 4,
    StoryNotFound = 5,
    InvalidState = 6,
    InvalidInput = 7,
    InvalidBudget = 8,
    InvalidAllocation = 9,
    AlreadyFunded = 10,
    AlreadyPaid = 11,
    InsufficientEscrow = 12,
    NoDevelopers = 13,
    Disputed = 14,
    ReviewWindowOpen = 15,
    Overflow = 16,
}
