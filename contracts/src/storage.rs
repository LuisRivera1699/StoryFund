use crate::types::{Allocation, Config, Project, Story};
use soroban_sdk::{contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Config,
    Project(u32),
    Story(u32, u32),
    Allocations(u32, u32),
    OwnerProjects(Address),
}

pub fn has_config(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

pub fn require_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .unwrap_or_else(|| {
            panic_with_error!(env, crate::Error::NotInitialized);
        })
}

pub fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
    // Extend TTL generously for a long-lived protocol contract
    env.storage()
        .instance()
        .extend_ttl(100_000, 100_000);
}

pub fn require_project(env: &Env, project_id: u32) -> Project {
    env.storage()
        .persistent()
        .get(&DataKey::Project(project_id))
        .unwrap_or_else(|| {
            panic_with_error!(env, crate::Error::ProjectNotFound);
        })
}

pub fn set_project(env: &Env, project: &Project) {
    let key = DataKey::Project(project.project_id);
    env.storage().persistent().set(&key, project);
    env.storage().persistent().extend_ttl(&key, 50_000, 50_000);
}

pub fn get_story(env: &Env, project_id: u32, story_id: u32) -> Option<Story> {
    env.storage()
        .persistent()
        .get(&DataKey::Story(project_id, story_id))
}

pub fn require_story(env: &Env, project_id: u32, story_id: u32) -> Story {
    get_story(env, project_id, story_id).unwrap_or_else(|| {
        panic_with_error!(env, crate::Error::StoryNotFound);
    })
}

pub fn set_story(env: &Env, project_id: u32, story: &Story) {
    let key = DataKey::Story(project_id, story.story_id);
    env.storage().persistent().set(&key, story);
    env.storage().persistent().extend_ttl(&key, 50_000, 50_000);
    let _ = project_id;
}

pub fn get_allocations_or_empty(env: &Env, project_id: u32, story_id: u32) -> Vec<Allocation> {
    env.storage()
        .persistent()
        .get(&DataKey::Allocations(project_id, story_id))
        .unwrap_or_else(|| Vec::new(env))
}

pub fn set_allocations(env: &Env, project_id: u32, story_id: u32, allocations: &Vec<Allocation>) {
    let key = DataKey::Allocations(project_id, story_id);
    env.storage().persistent().set(&key, allocations);
    env.storage().persistent().extend_ttl(&key, 50_000, 50_000);
}

pub fn set_owner_project(env: &Env, owner: &Address, project_id: u32) {
    let key = DataKey::OwnerProjects(owner.clone());
    let mut list: Vec<u32> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    list.push_back(project_id);
    env.storage().persistent().set(&key, &list);
    env.storage().persistent().extend_ttl(&key, 50_000, 50_000);
}

use soroban_sdk::panic_with_error;
