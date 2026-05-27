//! Integration tests for `scrum_md` — exercises the full project / story /
//! epic / sprint / task lifecycle against an in-memory SQLite database.
//!
//! These tests use the library's public API (the same functions that Tauri
//! commands delegate to) so they remain valid even if internal helpers change.

use bemind_liteduck_lib::db::Connection;
use bemind_liteduck_lib::scrum_md::{
    epic_create, epic_delete, epic_get, epic_list, epic_update, epic_update_status, project_create,
    project_get, project_list, sprint_add_item, sprint_close, sprint_create, sprint_delete,
    sprint_get, sprint_list, sprint_remove_item, sprint_start, story_assign, story_create,
    story_delete, story_get, story_list, story_update_points, story_update_status, task_create,
    task_get, task_list, NewEpic, NewProject, NewSprint, NewStory, NewTask,
};

// ── helpers ───────────────────────────────────────────────────────────────────

/// Opens an in-memory database with the scrum schema initialised.
fn mem_conn() -> Connection {
    liteduck_core::db::open_in_memory().expect("in-memory DB")
}

fn new_project() -> NewProject {
    NewProject {
        name: "Integration Test Project".into(),
        key: "ITP".into(),
        description: Some("Created by integration test".into()),
        workspace_directory: None,
    }
}

// ── project ───────────────────────────────────────────────────────────────────

#[test]
fn project_create_and_get_roundtrip() {
    let conn = mem_conn();

    let created = project_create(&conn, new_project()).expect("project_create");
    assert_eq!(created.name, "Integration Test Project");
    assert_eq!(created.key, "ITP");

    let fetched = project_get(&conn).expect("project_get");
    assert_eq!(fetched.id, created.id);
    assert_eq!(fetched.key, "ITP");
}

// ── story ─────────────────────────────────────────────────────────────────────

#[test]
fn story_lifecycle() {
    let conn = mem_conn();
    let project = project_create(&conn, new_project()).expect("project");

    // Create
    let story = story_create(
        &conn,
        NewStory {
            epic_id: None,
            project_id: project.id,
            title: "As a user I want to log in".into(),
            description: Some("Authentication story".into()),
            acceptance_criteria: None,
            status: None,
            priority: None,
            points: Some(3),
            assignee: None,
            dlc_phase: None,
        },
    )
    .expect("story_create");

    assert_eq!(story.title, "As a user I want to log in");
    assert_eq!(story.points, Some(3));

    // Get by id
    let fetched = story_get(&conn, story.id).expect("story_get");
    assert_eq!(fetched.id, story.id);

    // List
    let list = story_list(&conn, project.id).expect("story_list");
    assert_eq!(list.len(), 1);

    // Update status
    story_update_status(&conn, story.id, "in_progress", None).expect("story_update_status");
    let updated = story_get(&conn, story.id).expect("story after status update");
    assert_eq!(updated.status, "in_progress");

    // Update points
    story_update_points(&conn, story.id, Some(5)).expect("story_update_points");
    let pointed = story_get(&conn, story.id).expect("story after points update");
    assert_eq!(pointed.points, Some(5));

    // Assign
    story_assign(&conn, story.id, Some("alice")).expect("story_assign");
    let assigned = story_get(&conn, story.id).expect("story after assign");
    assert_eq!(assigned.assignee.as_deref(), Some("alice"));

    // Delete
    story_delete(&conn, story.id).expect("story_delete");
    let list_after = story_list(&conn, project.id).expect("story_list after delete");
    assert!(list_after.is_empty());
}

// ── epic ──────────────────────────────────────────────────────────────────────

#[test]
fn epic_lifecycle() {
    let conn = mem_conn();
    let project = project_create(&conn, new_project()).expect("project");

    let epic = epic_create(
        &conn,
        NewEpic {
            project_id: project.id,
            title: "Authentication epic".into(),
            description: Some("All auth features".into()),
            status: None,
            priority: None,
        },
    )
    .expect("epic_create");

    assert_eq!(epic.title, "Authentication epic");

    let fetched = epic_get(&conn, epic.id).expect("epic_get");
    assert_eq!(fetched.id, epic.id);

    let list = epic_list(&conn, project.id).expect("epic_list");
    assert_eq!(list.len(), 1);

    let updated = epic_update(
        &conn,
        epic.id,
        NewEpic {
            project_id: project.id,
            title: "Auth epic (renamed)".into(),
            description: None,
            status: None,
            priority: None,
        },
    )
    .expect("epic_update");
    assert_eq!(updated.title, "Auth epic (renamed)");

    epic_update_status(&conn, epic.id, "done").expect("epic_update_status");
    let closed = epic_get(&conn, epic.id).expect("epic after status update");
    assert_eq!(closed.status, "done");

    epic_delete(&conn, epic.id).expect("epic_delete");
    let list_after = epic_list(&conn, project.id).expect("epic_list after delete");
    assert!(list_after.is_empty());
}

// ── sprint ────────────────────────────────────────────────────────────────────

#[test]
fn sprint_lifecycle_with_story_membership() {
    let conn = mem_conn();
    let project = project_create(&conn, new_project()).expect("project");

    let story = story_create(
        &conn,
        NewStory {
            epic_id: None,
            project_id: project.id,
            title: "Sprint member story".into(),
            description: None,
            acceptance_criteria: None,
            status: None,
            priority: None,
            points: None,
            assignee: None,
            dlc_phase: None,
        },
    )
    .expect("story");

    let sprint = sprint_create(
        &conn,
        NewSprint {
            project_id: project.id,
            name: "Sprint 1".into(),
            goal: Some("Ship auth".into()),
            start_date: None,
            end_date: None,
        },
    )
    .expect("sprint_create");

    assert_eq!(sprint.name, "Sprint 1");
    assert_eq!(sprint.status, "planned");

    let fetched = sprint_get(&conn, sprint.id).expect("sprint_get");
    assert_eq!(fetched.id, sprint.id);

    let list = sprint_list(&conn, project.id).expect("sprint_list");
    assert_eq!(list.len(), 1);

    // Add story to sprint
    sprint_add_item(&conn, sprint.id, story.id).expect("sprint_add_item");

    // Start sprint
    sprint_start(&conn, sprint.id).expect("sprint_start");
    let started = sprint_get(&conn, sprint.id).expect("sprint after start");
    assert_eq!(started.status, "active");

    // Close sprint
    sprint_close(&conn, sprint.id).expect("sprint_close");
    let closed = sprint_get(&conn, sprint.id).expect("sprint after close");
    assert_eq!(closed.status, "completed");

    // Remove story from sprint and delete
    sprint_remove_item(&conn, sprint.id, story.id).expect("sprint_remove_item");
    sprint_delete(&conn, sprint.id).expect("sprint_delete");

    let list_after = sprint_list(&conn, project.id).expect("sprint_list after delete");
    assert!(list_after.is_empty());
}

// ── task ──────────────────────────────────────────────────────────────────────

#[test]
fn task_lifecycle() {
    let conn = mem_conn();
    let project = project_create(&conn, new_project()).expect("project");

    let story = story_create(
        &conn,
        NewStory {
            epic_id: None,
            project_id: project.id,
            title: "Parent story".into(),
            description: None,
            acceptance_criteria: None,
            status: None,
            priority: None,
            points: None,
            assignee: None,
            dlc_phase: None,
        },
    )
    .expect("story");

    let task = task_create(
        &conn,
        NewTask {
            story_id: story.id,
            title: "Write unit tests".into(),
            description: Some("Cover all edge cases".into()),
            status: None,
            estimated_hours: Some(4.0),
            actual_hours: None,
        },
    )
    .expect("task_create");

    assert_eq!(task.title, "Write unit tests");
    assert_eq!(task.estimated_hours, Some(4.0));

    let fetched = task_get(&conn, task.id).expect("task_get");
    assert_eq!(fetched.id, task.id);

    let list = task_list(&conn, story.id).expect("task_list");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].title, "Write unit tests");
}

// ── workspace scoping ─────────────────────────────────────────────────────────

/// Verifies that `project_list` with a workspace filter returns only projects
/// whose `workspace_directory` matches (or is NULL), not projects belonging to
/// a different workspace.
#[test]
fn project_list_filters_by_workspace() {
    let conn = mem_conn();

    let ws_a = "/workspace/alpha";
    let ws_b = "/workspace/beta";

    // Project pinned to workspace A.
    project_create(
        &conn,
        NewProject {
            name: "Alpha Project".into(),
            key: "ALP".into(),
            description: None,
            workspace_directory: Some(ws_a.into()),
        },
    )
    .expect("create alpha project");

    // Project pinned to workspace B.
    project_create(
        &conn,
        NewProject {
            name: "Beta Project".into(),
            key: "BET".into(),
            description: None,
            workspace_directory: Some(ws_b.into()),
        },
    )
    .expect("create beta project");

    // Project with no workspace (global / unscoped).
    project_create(
        &conn,
        NewProject {
            name: "Global Project".into(),
            key: "GLB".into(),
            description: None,
            workspace_directory: None,
        },
    )
    .expect("create global project");

    // Filtering by workspace A returns only alpha + global (NULL workspace).
    let for_a = project_list(&conn, Some(ws_a)).expect("project_list ws_a");
    assert_eq!(for_a.len(), 2, "workspace A should see alpha + global");
    assert!(for_a.iter().any(|p| p.key == "ALP"));
    assert!(for_a.iter().any(|p| p.key == "GLB"));
    assert!(
        !for_a.iter().any(|p| p.key == "BET"),
        "beta must not appear for workspace A"
    );

    // Filtering by workspace B returns only beta + global.
    let for_b = project_list(&conn, Some(ws_b)).expect("project_list ws_b");
    assert_eq!(for_b.len(), 2, "workspace B should see beta + global");
    assert!(for_b.iter().any(|p| p.key == "BET"));
    assert!(for_b.iter().any(|p| p.key == "GLB"));
    assert!(
        !for_b.iter().any(|p| p.key == "ALP"),
        "alpha must not appear for workspace B"
    );

    // No filter returns all three.
    let all = project_list(&conn, None).expect("project_list no filter");
    assert_eq!(all.len(), 3, "no filter should return all projects");
}
