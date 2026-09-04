use soroban_sdk::{symbol_short, Address, Env, String, Symbol};

pub fn emit_project_created(env: &Env, project_id: u32, owner: &Address, title: &String) {
    env.events().publish(
        (symbol_short!("PROJ_CRT"), project_id),
        (owner.clone(), title.clone()),
    );
}

pub fn emit_project_funded(env: &Env, project_id: u32, amount: i128, funder: &Address) {
    env.events().publish(
        (symbol_short!("PROJ_FND"), project_id),
        (amount, funder.clone()),
    );
}

pub fn emit_story_created(
    env: &Env,
    project_id: u32,
    story_id: u32,
    title: &String,
    budget: i128,
) {
    env.events().publish(
        (symbol_short!("STY_CRT"), project_id, story_id),
        (title.clone(), budget),
    );
}

pub fn emit_story_funded(
    env: &Env,
    project_id: u32,
    story_id: u32,
    amount: i128,
    funder: &Address,
) {
    env.events().publish(
        (symbol_short!("STY_FND"), project_id, story_id),
        (amount, funder.clone()),
    );
}

pub fn emit_developer_assigned(
    env: &Env,
    project_id: u32,
    story_id: u32,
    developer: &Address,
    share_bps: u32,
) {
    env.events().publish(
        (symbol_short!("DEV_ASGN"), project_id, story_id),
        (developer.clone(), share_bps),
    );
}

pub fn emit_story_started(env: &Env, project_id: u32, story_id: u32, developer: &Address) {
    env.events().publish(
        (symbol_short!("STY_STRT"), project_id, story_id),
        developer.clone(),
    );
}

pub fn emit_story_submitted(
    env: &Env,
    project_id: u32,
    story_id: u32,
    developer: &Address,
    review_deadline: u64,
) {
    env.events().publish(
        (symbol_short!("STY_SUB"), project_id, story_id),
        (developer.clone(), review_deadline),
    );
}

pub fn emit_story_approved(
    env: &Env,
    project_id: u32,
    story_id: u32,
    owner: &Address,
    amount: i128,
) {
    env.events().publish(
        (symbol_short!("STY_APPR"), project_id, story_id),
        (owner.clone(), amount),
    );
}

pub fn emit_story_disputed(env: &Env, project_id: u32, story_id: u32, owner: &Address) {
    env.events().publish(
        (symbol_short!("STY_DSP"), project_id, story_id),
        owner.clone(),
    );
}

pub fn emit_payment_released(
    env: &Env,
    project_id: u32,
    story_id: u32,
    developer: &Address,
    amount: i128,
) {
    env.events().publish(
        (Symbol::new(env, "PAY_REL"), project_id, story_id),
        (developer.clone(), amount),
    );
}

pub fn emit_project_completed(env: &Env, project_id: u32) {
    env.events()
        .publish((symbol_short!("PROJ_CMP"), project_id), ());
}

pub fn emit_project_cancelled(env: &Env, project_id: u32, owner: &Address) {
    env.events().publish(
        (symbol_short!("PROJ_CXL"), project_id),
        owner.clone(),
    );
}
