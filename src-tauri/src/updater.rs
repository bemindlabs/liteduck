use serde::Serialize;
use tauri::Emitter;

/// Current app version (from Cargo.toml at compile time).
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

/// GitHub owner/repo for public releases.
const RELEASES_REPO: &str = "bemindlabs/liteduck-releases";

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub release_notes: String,
    pub published_at: String,
    /// Platform-specific download URL for the installer asset.
    pub download_url: String,
    /// Filename of the installer asset.
    pub download_filename: String,
    /// Size in bytes of the installer asset (0 if unknown).
    pub download_size: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

/// Parse a semver string into (major, minor, patch).
fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.strip_prefix('v').unwrap_or(v);
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    Some((
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ))
}

/// Returns true if `latest` is newer than `current`.
fn is_newer(current: &str, latest: &str) -> bool {
    match (parse_semver(current), parse_semver(latest)) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

/// Determine installer file extension patterns for the current platform.
fn platform_asset_patterns() -> Vec<&'static str> {
    if cfg!(target_os = "macos") {
        vec![".dmg"]
    } else if cfg!(target_os = "windows") {
        vec![".msi", ".exe"]
    } else {
        // Linux — prefer AppImage, then .deb
        vec![".AppImage", ".deb"]
    }
}

/// Find the best matching asset from a GitHub release for this platform + arch.
fn find_platform_asset(assets: &[serde_json::Value]) -> Option<(String, String, u64)> {
    let patterns = platform_asset_patterns();
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };

    // First pass: match pattern + arch
    for pat in &patterns {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            let url = asset["browser_download_url"].as_str().unwrap_or("");
            let size = asset["size"].as_u64().unwrap_or(0);
            if name.ends_with(pat) && name.contains(arch) {
                return Some((url.to_string(), name.to_string(), size));
            }
        }
    }

    // Second pass: match pattern only (for platforms with single-arch builds)
    for pat in &patterns {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            let url = asset["browser_download_url"].as_str().unwrap_or("");
            let size = asset["size"].as_u64().unwrap_or(0);
            if name.ends_with(pat) {
                return Some((url.to_string(), name.to_string(), size));
            }
        }
    }

    None
}

/// Check the GitHub releases API for the latest version.
#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        RELEASES_REPO
    );

    let client = reqwest::Client::builder()
        .user_agent("LiteDuck-Updater")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "GitHub API returned status {}",
            resp.status().as_u16()
        ));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse release JSON: {e}"))?;

    let tag = body["tag_name"].as_str().unwrap_or("").to_string();
    let latest_version = tag.strip_prefix('v').unwrap_or(&tag).to_string();
    let html_url = body["html_url"].as_str().unwrap_or("").to_string();
    let release_notes = body["body"].as_str().unwrap_or("").to_string();
    let published_at = body["published_at"].as_str().unwrap_or("").to_string();
    let has_update = is_newer(CURRENT_VERSION, &latest_version);

    // Find platform-specific installer asset
    let assets = body["assets"].as_array().cloned().unwrap_or_default();
    let (download_url, download_filename, download_size) =
        find_platform_asset(&assets).unwrap_or_default();

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version,
        has_update,
        release_url: html_url,
        release_notes,
        published_at,
        download_url,
        download_filename,
        download_size,
    })
}

/// Download the update installer to a temp directory.
/// Emits `update-download-progress` events for the frontend to track progress.
#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<String, String> {
    use futures_util::StreamExt;

    if url.is_empty() {
        return Err("No download URL provided".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("LiteDuck-Updater")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "Download failed with status {}",
            resp.status().as_u16()
        ));
    }

    let total = resp.content_length().unwrap_or(0);

    // Create temp directory for the download
    let download_dir = std::env::temp_dir().join("liteduck-update");
    std::fs::create_dir_all(&download_dir)
        .map_err(|e| format!("Failed to create download directory: {e}"))?;

    let file_path = download_dir.join(&filename);
    let mut file = tokio::fs::File::create(&file_path)
        .await
        .map_err(|e| format!("Failed to create file: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {e}"))?;

        downloaded += chunk.len() as u64;

        // Emit progress at most every 100ms to avoid flooding
        if last_emit.elapsed().as_millis() >= 100 || downloaded == total {
            let percentage = if total > 0 {
                (downloaded as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            let _ = app.emit(
                "update-download-progress",
                DownloadProgress {
                    downloaded,
                    total,
                    percentage,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    // Ensure all data is flushed
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;

    let path_str = file_path.to_str().ok_or("Invalid file path")?.to_string();

    Ok(path_str)
}

/// Open/install the downloaded update file using the system's default handler.
#[tauri::command]
pub async fn install_update(path: String) -> Result<(), String> {
    use std::process::Command;

    let file_path = std::path::Path::new(&path);

    if !file_path.exists() {
        return Err("Downloaded file not found".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(file_path)
            .spawn()
            .map_err(|e| format!("Failed to open installer: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &file_path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open installer: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
        match ext {
            "AppImage" => {
                // Make executable and run
                let _ = Command::new("chmod")
                    .args(["+x", &file_path.to_string_lossy()])
                    .status();
                Command::new(file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to run AppImage: {e}"))?;
            }
            _ => {
                Command::new("xdg-open")
                    .arg(file_path)
                    .spawn()
                    .map_err(|e| format!("Failed to open file: {e}"))?;
            }
        }
    }

    Ok(())
}

/// Get the current app version without making any network requests.
#[tauri::command]
pub fn get_app_version() -> String {
    CURRENT_VERSION.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_semver() {
        assert_eq!(parse_semver("0.2.0"), Some((0, 2, 0)));
        assert_eq!(parse_semver("v1.3.5"), Some((1, 3, 5)));
        assert_eq!(parse_semver("invalid"), None);
    }

    #[test]
    fn test_is_newer() {
        assert!(is_newer("0.2.0", "0.3.0"));
        assert!(is_newer("0.2.0", "1.0.0"));
        assert!(is_newer("0.2.0", "0.2.1"));
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(!is_newer("0.3.0", "0.2.0"));
    }

    #[test]
    fn test_platform_patterns() {
        let patterns = platform_asset_patterns();
        assert!(!patterns.is_empty());
    }

    #[test]
    fn test_find_platform_asset_empty() {
        assert_eq!(find_platform_asset(&[]), None);
    }
}
