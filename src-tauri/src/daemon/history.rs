use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use log::{info, warn, error};

use crate::db::queries;

/// Known browser history database paths per platform
fn get_browser_paths() -> Vec<(String, String, PathBuf)> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut paths = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let base = home.join("Library/Application Support");
        // Chrome
        add_profiles(&base.join("Google/Chrome"), "chrome", &mut paths);
        // Brave
        add_profiles(&base.join("BraveSoftware/Brave-Browser"), "brave", &mut paths);
        // Edge
        add_profiles(&base.join("Microsoft Edge"), "edge", &mut paths);
        // Firefox
        add_firefox_profiles(&home.join("Library/Application Support/Firefox"), &mut paths);
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local_app) = dirs::data_local_dir() {
            add_profiles(&local_app.join("Google/Chrome/User Data"), "chrome", &mut paths);
            add_profiles(&local_app.join("BraveSoftware/Brave-Browser/User Data"), "brave", &mut paths);
            add_profiles(&local_app.join("Microsoft/Edge/User Data"), "edge", &mut paths);
        }
        if let Some(roaming) = dirs::config_dir() {
            add_firefox_profiles(&roaming.join("Mozilla/Firefox"), &mut paths);
        }
    }

    paths
}

/// Find Chromium-based browser profiles
fn add_profiles(browser_dir: &PathBuf, browser_name: &str, paths: &mut Vec<(String, String, PathBuf)>) {
    if !browser_dir.exists() {
        return;
    }

    // Default profile
    let default_history = browser_dir.join("Default/History");
    if default_history.exists() {
        paths.push((browser_name.to_string(), "Default".to_string(), default_history));
    }

    // Numbered profiles (Profile 1, Profile 2, etc.)
    if let Ok(entries) = std::fs::read_dir(browser_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("Profile ") {
                let history = entry.path().join("History");
                if history.exists() {
                    paths.push((browser_name.to_string(), name, history));
                }
            }
        }
    }
}

/// Find Firefox profiles
fn add_firefox_profiles(firefox_dir: &PathBuf, paths: &mut Vec<(String, String, PathBuf)>) {
    let profiles_dir = firefox_dir.join("Profiles");
    if !profiles_dir.exists() {
        return;
    }

    if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
        for entry in entries.flatten() {
            let places = entry.path().join("places.sqlite");
            if places.exists() {
                let name = entry.file_name().to_string_lossy().to_string();
                paths.push(("firefox".to_string(), name, places));
            }
        }
    }
}

/// Scan browser history databases for blacklisted domain visits
pub fn scan_browser_history(db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start = Instant::now();

    let blacklist = {
        let conn = db.lock().unwrap();
        queries::get_blacklist_domains(&conn)
    };

    if blacklist.is_empty() {
        info!("No blacklist domains configured, skipping history scan");
        return Ok(());
    }

    let browser_paths = get_browser_paths();
    let mut total_violations = 0;

    for (browser, profile, history_path) in &browser_paths {
        match scan_single_browser(db, browser, profile, history_path, &blacklist) {
            Ok(count) => {
                total_violations += count;
                if count > 0 {
                    info!("Found {} violations in {}:{}", count, browser, profile);
                }
            }
            Err(e) => {
                warn!("Failed to scan {}:{} - {}", browser, profile, e);
            }
        }
    }

    let duration = start.elapsed().as_millis() as i64;
    let conn = db.lock().unwrap();
    queries::log_sync(
        &conn,
        "history_scan",
        "success",
        Some(&format!("Scanned {} browsers, found {} violations", browser_paths.len(), total_violations)),
        Some(duration),
    )?;

    Ok(())
}

/// Scan a single browser's history database
fn scan_single_browser(
    db: &Arc<Mutex<Connection>>,
    browser: &str,
    profile: &str,
    history_path: &PathBuf,
    blacklist: &[String],
) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
    // Copy the database file to a temp location to avoid lock conflicts
    let temp_dir = std::env::temp_dir().join("habit-calendar-history");
    std::fs::create_dir_all(&temp_dir)?;
    let temp_path = temp_dir.join(format!("{}_{}_history.db", browser, profile.replace(' ', "_")));

    std::fs::copy(history_path, &temp_path)?;

    let hist_conn = rusqlite::Connection::open_with_flags(
        &temp_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;

    // Get the timestamp for "today at midnight" in the browser's format
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Chromium stores timestamps as microseconds since 1601-01-01
    // Firefox stores timestamps as microseconds since 1970-01-01
    let is_firefox = browser == "firefox";

    let query = if is_firefox {
        "SELECT url, last_visit_date FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 500"
    } else {
        "SELECT url, last_visit_time FROM urls WHERE last_visit_time > 0 ORDER BY last_visit_time DESC LIMIT 500"
    };

    let mut stmt = hist_conn.prepare(query)?;
    let mut violations_count = 0;

    let rows = stmt.query_map([], |row| {
        let url: String = row.get(0)?;
        let timestamp: i64 = row.get(1)?;
        Ok((url, timestamp))
    })?;

    let conn = db.lock().unwrap();

    for row in rows {
        if let Ok((url, timestamp)) = row {
            // Extract domain from URL
            if let Some(domain) = extract_domain(&url) {
                // Check if domain is in blacklist
                let is_blacklisted = blacklist.iter().any(|bl| {
                    domain == *bl || domain.ends_with(&format!(".{}", bl))
                });

                if is_blacklisted {
                    // Convert timestamp to ISO format
                    let visit_time = if is_firefox {
                        // Firefox: microseconds since Unix epoch
                        chrono::DateTime::from_timestamp(timestamp / 1_000_000, 0)
                            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%dT%H:%M:%S").to_string())
                            .unwrap_or_default()
                    } else {
                        // Chromium: microseconds since 1601-01-01
                        let unix_ts = (timestamp - 11644473600000000) / 1_000_000;
                        chrono::DateTime::from_timestamp(unix_ts, 0)
                            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%dT%H:%M:%S").to_string())
                            .unwrap_or_default()
                    };

                    if !visit_time.is_empty() {
                        let visit_date = &visit_time[..10]; // Extract YYYY-MM-DD

                        // Only log visits from recent days (not ancient history)
                        let days_ago = chrono::Local::now()
                            .date_naive()
                            .signed_duration_since(
                                chrono::NaiveDate::parse_from_str(visit_date, "%Y-%m-%d")
                                    .unwrap_or(chrono::Local::now().date_naive()),
                            )
                            .num_days();

                        if days_ago <= 7 {
                            let _ = queries::insert_violation(
                                &conn,
                                &domain,
                                Some(&url),
                                &visit_time,
                                visit_date,
                                Some(browser),
                                Some(profile),
                                "desktop",
                                "history_scan",
                            );
                            violations_count += 1;
                        }
                    }
                }
            }
        }
    }

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    Ok(violations_count)
}

/// Extract domain from a URL
fn extract_domain(url: &str) -> Option<String> {
    let url = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let domain = url.split('/').next()?;
    let domain = domain.split(':').next()?; // Remove port
    Some(domain.to_lowercase())
}
