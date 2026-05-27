//! Obsidian-format agent memory system.
//!
//! Notes are stored as markdown files with YAML frontmatter in
//! `<workspace>/.LiteDuck/.agents/memory/`. Supports wikilinks (`[[note]]`),
//! tags, backlink resolution, and full-text search.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryNote {
    pub slug: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub tags: Vec<String>,
    pub related: Vec<String>,
    pub created: String,
    pub updated: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryNoteSummary {
    pub slug: String,
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub tags: Vec<String>,
    pub created: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMemoryNote {
    pub title: String,
    #[serde(rename = "type")]
    pub note_type: String,
    pub tags: Vec<String>,
    pub related: Vec<String>,
    pub body: String,
}

// ── Paths ────────────────────────────────────────────────────────────────────

fn memory_dir(workspace: &str) -> PathBuf {
    Path::new(workspace)
        .join(".LiteDuck")
        .join(".agents")
        .join("memory")
}

fn note_path(workspace: &str, slug: &str) -> PathBuf {
    memory_dir(workspace).join(format!("{slug}.md"))
}

/// Public slugify for use by other modules.
pub fn slugify_pub(title: &str) -> String {
    slugify(title)
}

fn slugify(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

// ── Frontmatter parsing ─────────────────────────────────────────────────────

fn parse_frontmatter(content: &str) -> (HashMap<String, String>, Vec<String>, Vec<String>, &str) {
    let mut tags = Vec::new();
    let mut related = Vec::new();
    let mut fields = HashMap::new();

    if !content.starts_with("---") {
        return (fields, tags, related, content);
    }

    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(i) => i,
        None => return (fields, tags, related, content),
    };

    let fm = &rest[..end];
    let body = &rest[end + 4..];
    let body = body.strip_prefix('\n').unwrap_or(body);

    for line in fm.lines() {
        let line = line.trim();
        if let Some((key, val)) = line.split_once(':') {
            let key = key.trim();
            let val = val.trim();

            if key == "tags" {
                // Parse [tag1, tag2] or - tag
                let clean = val.trim_start_matches('[').trim_end_matches(']');
                tags = clean
                    .split(',')
                    .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            } else if key == "related" {
                let clean = val.trim_start_matches('[').trim_end_matches(']');
                related = clean
                    .split(',')
                    .map(|s| {
                        s.trim()
                            .trim_matches('"')
                            .trim_matches('\'')
                            .trim_start_matches("[[")
                            .trim_end_matches("]]")
                            .to_string()
                    })
                    .filter(|s| !s.is_empty())
                    .collect();
            } else {
                fields.insert(key.to_string(), val.trim_matches('"').to_string());
            }
        }
    }

    (fields, tags, related, body)
}

/// Render a `MemoryNote` to an Obsidian-format markdown string.
pub fn render_note_pub(note: &MemoryNote) -> String {
    render_note(note)
}

fn render_note(note: &MemoryNote) -> String {
    let tags_str = if note.tags.is_empty() {
        "[]".to_string()
    } else {
        format!(
            "[{}]",
            note.tags
                .iter()
                .map(|t| format!("\"{t}\""))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    let related_str = if note.related.is_empty() {
        "[]".to_string()
    } else {
        format!(
            "[{}]",
            note.related
                .iter()
                .map(|r| format!("\"[[{r}]]\""))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    format!(
        "---\ntype: {}\ntags: {}\nrelated: {}\ncreated: {}\nupdated: {}\n---\n\n# {}\n\n{}",
        note.note_type, tags_str, related_str, note.created, note.updated, note.title, note.body
    )
}

/// Parse a markdown file with YAML frontmatter into a `MemoryNote`.
pub fn parse_note_pub(slug: &str, content: &str) -> MemoryNote {
    parse_note(slug, content)
}

fn parse_note(slug: &str, content: &str) -> MemoryNote {
    let (fields, tags, related, body) = parse_frontmatter(content);

    // Extract title from first # heading or use slug
    let title = body
        .lines()
        .find(|l| l.starts_with("# "))
        .map(|l| l[2..].trim().to_string())
        .unwrap_or_else(|| slug.replace('-', " "));

    // Strip the title heading from body
    let body_without_title = if body.starts_with("# ") {
        body.lines()
            .skip(1)
            .collect::<Vec<_>>()
            .join("\n")
            .trim_start_matches('\n')
            .to_string()
    } else {
        body.to_string()
    };

    MemoryNote {
        slug: slug.to_string(),
        title,
        note_type: fields
            .get("type")
            .cloned()
            .unwrap_or_else(|| "context".into()),
        tags,
        related,
        created: fields
            .get("created")
            .cloned()
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string()),
        updated: fields
            .get("updated")
            .cloned()
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string()),
        body: body_without_title,
    }
}

// ── Wikilink extraction ─────────────────────────────────────────────────────

/// Extract all `[[slug]]` references from markdown content.
pub fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut links = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        if let Some(end) = rest.find("]]") {
            let link = rest[..end].trim().to_string();
            if !link.is_empty() {
                links.push(link);
            }
            rest = &rest[end + 2..];
        }
    }
    links
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn memory_list(workspace: String) -> Result<Vec<MemoryNoteSummary>, String> {
    let dir = memory_dir(&workspace);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut notes = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            notes.push(MemoryNoteSummary {
                slug: note.slug,
                title: note.title,
                note_type: note.note_type,
                tags: note.tags,
                created: note.created,
            });
        }
    }

    notes.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(notes)
}

#[tauri::command]
pub async fn memory_get(workspace: String, slug: String) -> Result<MemoryNote, String> {
    let path = note_path(&workspace, &slug);
    let content = fs::read_to_string(&path).map_err(|e| format!("Note not found: {e}"))?;
    Ok(parse_note(&slug, &content))
}

#[tauri::command]
pub async fn memory_create(workspace: String, note: NewMemoryNote) -> Result<MemoryNote, String> {
    let dir = memory_dir(&workspace);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let slug = slugify(&note.title);
    let now = Utc::now().format("%Y-%m-%d").to_string();

    let mem = MemoryNote {
        slug: slug.clone(),
        title: note.title,
        note_type: note.note_type,
        tags: note.tags,
        related: note.related,
        created: now.clone(),
        updated: now,
        body: note.body,
    };

    let path = note_path(&workspace, &slug);
    if path.exists() {
        return Err(format!(
            "Note with slug '{slug}' already exists. Use memory_update instead."
        ));
    }
    fs::write(&path, render_note(&mem)).map_err(|e| e.to_string())?;

    // Rebuild index
    rebuild_index(&workspace);

    Ok(mem)
}

#[tauri::command]
pub async fn memory_update(
    workspace: String,
    slug: String,
    note: NewMemoryNote,
) -> Result<MemoryNote, String> {
    let path = note_path(&workspace, &slug);
    if !path.exists() {
        return Err(format!("Note '{slug}' not found."));
    }

    let existing = parse_note(
        &slug,
        &fs::read_to_string(&path).map_err(|e| e.to_string())?,
    );

    let now = Utc::now().format("%Y-%m-%d").to_string();
    let mem = MemoryNote {
        slug: slug.clone(),
        title: note.title,
        note_type: note.note_type,
        tags: note.tags,
        related: note.related,
        created: existing.created,
        updated: now,
        body: note.body,
    };

    fs::write(&path, render_note(&mem)).map_err(|e| e.to_string())?;
    rebuild_index(&workspace);
    Ok(mem)
}

#[tauri::command]
pub async fn memory_delete(workspace: String, slug: String) -> Result<(), String> {
    let path = note_path(&workspace, &slug);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        rebuild_index(&workspace);
    }
    Ok(())
}

/// Search memory notes by query (matches title, tags, body).
#[tauri::command]
pub async fn memory_search(
    workspace: String,
    query: String,
) -> Result<Vec<MemoryNoteSummary>, String> {
    let all = memory_list(workspace.clone()).await?;
    let q = query.to_lowercase();

    // Also search body content
    let dir = memory_dir(&workspace);
    let mut results = Vec::new();

    for note in all {
        let matches_meta = note.title.to_lowercase().contains(&q)
            || note.tags.iter().any(|t| t.to_lowercase().contains(&q))
            || note.note_type.to_lowercase().contains(&q);

        if matches_meta {
            results.push(note);
            continue;
        }

        // Check body
        let path = dir.join(format!("{}.md", note.slug));
        if let Ok(content) = fs::read_to_string(&path) {
            if content.to_lowercase().contains(&q) {
                results.push(note);
            }
        }
    }

    Ok(results)
}

/// Get backlinks — notes that link to the given slug via `[[slug]]`.
#[tauri::command]
pub async fn memory_backlinks(
    workspace: String,
    slug: String,
) -> Result<Vec<MemoryNoteSummary>, String> {
    let dir = memory_dir(&workspace);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let other_slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if other_slug == slug || other_slug == "index" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let links = extract_wikilinks(&content);
            if links.iter().any(|l| l == &slug) {
                let note = parse_note(&other_slug, &content);
                results.push(MemoryNoteSummary {
                    slug: note.slug,
                    title: note.title,
                    note_type: note.note_type,
                    tags: note.tags,
                    created: note.created,
                });
            }
        }
    }

    Ok(results)
}

/// Find memory notes relevant to a story (by title keywords and tags).
/// Used for context injection into AI prompts.
pub fn find_relevant_notes(workspace: &str, title: &str, max: usize) -> Vec<MemoryNote> {
    let dir = memory_dir(workspace);
    if !dir.exists() {
        return Vec::new();
    }

    let keywords: Vec<String> = title
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 3)
        .map(|w| w.to_string())
        .collect();

    let mut scored: Vec<(usize, MemoryNote)> = Vec::new();

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            let lower_content = content.to_lowercase();

            let mut score = 0usize;
            for kw in &keywords {
                if lower_content.contains(kw.as_str()) {
                    score += 1;
                }
            }
            // Boost context and pattern notes
            if note.note_type == "context" || note.note_type == "pattern" {
                score += 1;
            }

            if score > 0 {
                scored.push((score, note));
            }
        }
    }

    scored.sort_by_key(|b| std::cmp::Reverse(b.0));
    scored.into_iter().take(max).map(|(_, n)| n).collect()
}

// ── Index ────────────────────────────────────────────────────────────────────

/// Rebuild the `index.md` for an arbitrary memory directory.
/// Used by `home.rs` to regenerate the global memory index.
pub fn rebuild_index_at(dir: &std::path::Path) {
    if !dir.exists() {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut by_type: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" || slug == "MEMORY" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            by_type
                .entry(note.note_type.clone())
                .or_default()
                .push((slug, note.title));
        }
    }

    let mut index = String::from("# Memory Index\n\nAuto-generated index of all memory notes.\n");

    let mut types: Vec<_> = by_type.keys().cloned().collect();
    types.sort();

    for t in types {
        if let Some(notes) = by_type.get(&t) {
            index.push_str(&format!("\n## {}\n\n", capitalize(&t)));
            let mut sorted = notes.clone();
            sorted.sort_by(|a, b| a.1.cmp(&b.1));
            for (slug, title) in sorted {
                index.push_str(&format!("- [[{slug}]] — {title}\n"));
            }
        }
    }

    let _ = fs::write(dir.join("index.md"), index);
}

/// Search a memory directory for notes relevant to a title (keyword scoring).
pub fn find_relevant_notes_at(dir: &std::path::Path, title: &str, max: usize) -> Vec<MemoryNote> {
    if !dir.exists() {
        return Vec::new();
    }

    let keywords: Vec<String> = title
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() > 3)
        .map(|w| w.to_string())
        .collect();

    let mut scored: Vec<(usize, MemoryNote)> = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" || slug == "MEMORY" {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            let lower_content = content.to_lowercase();

            let mut score = 0usize;
            for kw in &keywords {
                if lower_content.contains(kw.as_str()) {
                    score += 1;
                }
            }
            // Boost user, project and reference notes (global memory types)
            if matches!(
                note.note_type.as_str(),
                "user" | "project" | "reference" | "context" | "pattern"
            ) {
                score += 1;
            }

            if score > 0 {
                scored.push((score, note));
            }
        }
    }

    scored.sort_by_key(|b| std::cmp::Reverse(b.0));
    scored.into_iter().take(max).map(|(_, n)| n).collect()
}

fn rebuild_index(workspace: &str) {
    let dir = memory_dir(workspace);
    if !dir.exists() {
        return;
    }

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let mut by_type: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let slug = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if slug == "index" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            let note = parse_note(&slug, &content);
            by_type
                .entry(note.note_type.clone())
                .or_default()
                .push((slug, note.title));
        }
    }

    let mut index = String::from("# Agent Memory\n\nAuto-generated index of all memory notes.\n");

    let mut types: Vec<_> = by_type.keys().cloned().collect();
    types.sort();

    for t in types {
        if let Some(notes) = by_type.get(&t) {
            index.push_str(&format!("\n## {}\n\n", capitalize(&t)));
            let mut sorted = notes.clone();
            sorted.sort_by(|a, b| a.1.cmp(&b.1));
            for (slug, title) in sorted {
                index.push_str(&format!("- [[{slug}]] — {title}\n"));
            }
        }
    }

    let _ = fs::write(dir.join("index.md"), index);
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

// ── Multi-layer search ────────────────────────────────────────────────────────

/// Search both workspace-level and global (`~/.LiteDuck/memory/`) notes.
///
/// Workspace notes take precedence when slugs collide. The combined results
/// are re-sorted by score and truncated to `max`.
pub fn find_relevant_notes_multi_layer(
    workspace: &str,
    title: &str,
    max: usize,
    global_dir: &std::path::Path,
) -> Vec<MemoryNote> {
    // Workspace-level notes (existing behaviour).
    let workspace_notes = find_relevant_notes(workspace, title, max);
    let workspace_slugs: std::collections::HashSet<String> =
        workspace_notes.iter().map(|n| n.slug.clone()).collect();

    // Global notes — skip any slug already present from the workspace layer.
    let global_notes = find_relevant_notes_at(global_dir, title, max);
    let unique_global: Vec<MemoryNote> = global_notes
        .into_iter()
        .filter(|n| !workspace_slugs.contains(&n.slug))
        .collect();

    let mut all = workspace_notes;
    all.extend(unique_global);
    all.truncate(max);
    all
}
