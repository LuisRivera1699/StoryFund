#![cfg(test)]

use crate::{
    ProjectStatus, StoryFund, StoryFundClient, StoryStatus,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, String, Vec,
};

fn setup<'a>() -> (
    Env,
    StoryFundClient<'a>,
    Address,
    token::Client<'a>,
    token::StellarAssetClient<'a>,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    let contract_id = env.register(StoryFund, ());
    let client = StoryFundClient::new(&env, &contract_id);

    // 48h default review window
    client.initialize(&token_address, &172_800);

    (
        env,
        client,
        token_address,
        token_client,
        token_admin_client,
        token_admin,
    )
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

#[test]
fn create_project_and_story() {
    let (env, client, _, _, _, _) = setup();
    let owner = Address::generate(&env);

    let pid = client.create_project(
        &owner,
        &s(&env, "Ecommerce"),
        &s(&env, "Build a shop"),
        &None,
    );
    assert_eq!(pid, 1);

    let project = client.get_project(&pid);
    assert_eq!(project.owner, owner);
    assert_eq!(project.status, ProjectStatus::Draft);

    let sid = client.create_story(
        &pid,
        &s(&env, "Login"),
        &s(&env, "Auth flow"),
        &s(&env, "User can log in"),
        &1_000_000_000, // 100 USDC (7 decimals)
        &s(&env, ""),
    );
    assert_eq!(sid, 1);

    let story = client.get_story(&pid, &sid);
    assert_eq!(story.budget, 1_000_000_000);
    assert_eq!(story.status, StoryStatus::Open);

    let project = client.get_project(&pid);
    assert_eq!(project.status, ProjectStatus::Funding);
    assert_eq!(project.total_budget, 1_000_000_000);
}

#[test]
fn fund_assign_submit_approve_payout() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);

    let budget = 1_000_000_000i128;
    token_admin.mint(&owner, &(budget * 2));

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "desc"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU1"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, "https://github.com/org/repo/issues/1"),
    );

    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);

    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);

    let story = client.get_story(&pid, &sid);
    assert_eq!(story.status, StoryStatus::Funded);
    assert_eq!(story.funded_amount, budget);

    let stats = client.get_project_stats(&pid);
    assert_eq!(stats.locked, budget);
    assert_eq!(stats.funded, budget);

    // Contract holds escrow
    assert_eq!(token.balance(&client.address), budget);

    client.start_story(&pid, &sid, &dev);
    assert_eq!(client.get_story(&pid, &sid).status, StoryStatus::InProgress);

    client.submit_story(&pid, &sid, &dev);
    assert_eq!(client.get_story(&pid, &sid).status, StoryStatus::Submitted);

    let bal_before = token.balance(&dev);
    client.approve_story(&pid, &sid);

    let story = client.get_story(&pid, &sid);
    assert_eq!(story.status, StoryStatus::Completed);
    assert!(story.paid);
    assert_eq!(token.balance(&dev), bal_before + budget);
    assert_eq!(token.balance(&client.address), 0);

    let stats = client.get_project_stats(&pid);
    assert_eq!(stats.locked, 0);
    assert_eq!(stats.released, budget);
}

#[test]
fn multiple_developers_percentage_allocation() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev_a = Address::generate(&env);
    let dev_b = Address::generate(&env);

    let budget = 1_000_000_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );

    let mut developers = Vec::new(&env);
    developers.push_back(dev_a.clone());
    developers.push_back(dev_b.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(6_000u32); // 60%
    shares.push_back(4_000u32); // 40%
    client.assign_developers(&pid, &sid, &developers, &shares);

    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev_a);
    client.submit_story(&pid, &sid, &dev_a);
    client.approve_story(&pid, &sid);

    assert_eq!(token.balance(&dev_a), 600_000_000);
    assert_eq!(token.balance(&dev_b), 400_000_000);
}

#[test]
fn allocation_rounding_remainder_to_last() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);
    let d3 = Address::generate(&env);

    // 100 stroops — not evenly divisible by 3
    let budget = 100i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );

    let mut developers = Vec::new(&env);
    developers.push_back(d1.clone());
    developers.push_back(d2.clone());
    developers.push_back(d3.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(3333u32);
    shares.push_back(3333u32);
    shares.push_back(3334u32);
    client.assign_developers(&pid, &sid, &developers, &shares);

    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &d1);
    client.submit_story(&pid, &sid, &d1);
    client.approve_story(&pid, &sid);

    // Exact sum, no dust left in contract
    assert_eq!(
        token.balance(&d1) + token.balance(&d2) + token.balance(&d3),
        budget
    );
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn unauthorized_approval() {
    // Non-assigned wallet cannot start a story (Unauthorized).
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let assigned = Address::generate(&env);
    let attacker = Address::generate(&env);
    let budget = 1_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(assigned);
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &attacker);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn unauthorized_developer_start() {
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let outsider = Address::generate(&env);
    let budget = 1_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev);
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);

    client.start_story(&pid, &sid, &outsider);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn double_payout_blocked() {
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 1_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev);
    client.submit_story(&pid, &sid, &dev);
    client.approve_story(&pid, &sid);

    // Second approve must fail (AlreadyPaid or InvalidState)
    client.approve_story(&pid, &sid);
}

#[test]
fn dispute_blocks_payout_until_resolved() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 5_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev);
    client.submit_story(&pid, &sid, &dev);
    client.dispute_story(&pid, &sid);

    assert_eq!(client.get_story(&pid, &sid).status, StoryStatus::Disputed);
    assert_eq!(token.balance(&client.address), budget);

    // Resolve against developer → refund owner
    let owner_before = token.balance(&owner);
    client.resolve_dispute(&pid, &sid, &false);
    assert_eq!(client.get_story(&pid, &sid).status, StoryStatus::Cancelled);
    assert_eq!(token.balance(&owner), owner_before + budget);
    assert_eq!(token.balance(&dev), 0);
}

#[test]
fn dispute_resolve_approve_pays_developers() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 5_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev);
    client.submit_story(&pid, &sid, &dev);
    client.dispute_story(&pid, &sid);
    client.resolve_dispute(&pid, &sid, &true);

    assert_eq!(token.balance(&dev), budget);
    assert!(client.get_story(&pid, &sid).paid);
}

#[test]
fn auto_complete_after_review_window() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 2_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(
        &owner,
        &s(&env, "App"),
        &s(&env, "d"),
        &Some(100u64), // 100s window
    );
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev);
    client.submit_story(&pid, &sid, &dev);

    let deadline = client.get_story(&pid, &sid).review_deadline;
    env.ledger().with_mut(|l| {
        l.timestamp = deadline;
    });

    client.auto_complete_story(&pid, &sid);
    assert_eq!(token.balance(&dev), budget);
    assert!(client.get_story(&pid, &sid).paid);
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn auto_complete_before_window_fails() {
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 2_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &Some(10_000u64));
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.start_story(&pid, &sid, &dev);
    client.submit_story(&pid, &sid, &dev);
    client.auto_complete_story(&pid, &sid);
}

#[test]
fn cancel_project_refunds() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let budget = 3_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);

    let before = token.balance(&owner);
    client.cancel_project(&pid);
    assert_eq!(client.get_project(&pid).status, ProjectStatus::Cancelled);
    assert_eq!(token.balance(&owner), before + budget);
    assert_eq!(token.balance(&client.address), 0);
}

#[test]
fn fund_multiple_stories_one_tx() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let b1 = 1_000i128;
    let b2 = 2_500i128;
    token_admin.mint(&owner, &(b1 + b2));

    let pid = client.create_project(&owner, &s(&env, "Shop"), &s(&env, "d"), &None);
    let s1 = client.create_story(
        &pid,
        &s(&env, "Auth"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &b1,
        &s(&env, ""),
    );
    let s2 = client.create_story(
        &pid,
        &s(&env, "Cart"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &b2,
        &s(&env, ""),
    );

    let mut stories = Vec::new(&env);
    stories.push_back(s1);
    stories.push_back(s2);
    client.fund_stories(&pid, &stories, &owner);

    assert_eq!(client.get_story(&pid, &s1).status, StoryStatus::Funded);
    assert_eq!(client.get_story(&pid, &s2).status, StoryStatus::Funded);
    assert_eq!(token.balance(&client.address), b1 + b2);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn invalid_allocation_sum() {
    let (env, client, _, _, _, _) = setup();
    let owner = Address::generate(&env);
    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &100i128,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(Address::generate(&env));
    let mut shares = Vec::new(&env);
    shares.push_back(5_000u32); // not 100%
    client.assign_developers(&pid, &sid, &developers, &shares);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn invalid_state_transition_submit_without_start() {
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let dev = Address::generate(&env);
    let budget = 100i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut developers = Vec::new(&env);
    developers.push_back(dev.clone());
    let mut shares = Vec::new(&env);
    shares.push_back(10_000u32);
    client.assign_developers(&pid, &sid, &developers, &shares);
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);

    // Skip start → submit should fail
    client.submit_story(&pid, &sid, &dev);
}

#[test]
fn cancel_story_refund() {
    let (env, client, _, token, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let budget = 7_000i128;
    token_admin.mint(&owner, &budget);

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);

    let before = token.balance(&owner);
    client.cancel_story(&pid, &sid);
    assert_eq!(client.get_story(&pid, &sid).status, StoryStatus::Cancelled);
    assert_eq!(token.balance(&owner), before + budget);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn already_funded_story() {
    let (env, client, _, _, token_admin, _) = setup();
    let owner = Address::generate(&env);
    let budget = 100i128;
    token_admin.mint(&owner, &(budget * 2));

    let pid = client.create_project(&owner, &s(&env, "App"), &s(&env, "d"), &None);
    let sid = client.create_story(
        &pid,
        &s(&env, "HU"),
        &s(&env, "d"),
        &s(&env, "ac"),
        &budget,
        &s(&env, ""),
    );
    let mut stories = Vec::new(&env);
    stories.push_back(sid);
    client.fund_stories(&pid, &stories, &owner);
    client.fund_stories(&pid, &stories, &owner);
}
