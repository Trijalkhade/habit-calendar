use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use log::{info, warn, error};
use chrono::Timelike;
use serde::Deserialize;

use crate::db::queries;

#[derive(Debug, Deserialize)]
struct HeatmapEntry {
    date: Option<String>,
    value: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct ContestEntry {
    code: Option<String>,
    name: Option<String>,
    end_date: Option<String>,
}

/// Poll CodeChef's public profile page for solved problems and contest participation
pub async fn poll_codechef(db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start = Instant::now();

    let username = {
        let conn = db.lock().unwrap();
        queries::get_setting(&conn, "codechef_username")
    };

    let username = match username {
        Some(u) if !u.is_empty() => u,
        _ => {
            info!("No CodeChef username configured, skipping poll");
            return Ok(());
        }
    };

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()?;

    let url = format!("https://www.codechef.com/users/{}", username);
    let resp = client.get(&url).send().await?;
    let duration = start.elapsed().as_millis() as i64;

    if !resp.status().is_success() {
        let conn = db.lock().unwrap();
        queries::log_sync(
            &conn,
            "codechef_scraper",
            "error",
            Some(&format!("HTTP {}", resp.status())),
            Some(duration),
        )?;
        return Ok(());
    }

    let html = resp.text().await?;
    let mut problems_found = 0;
    let mut contests_found = 0;

    // Parse Heatmap Data (Problems Solved)
    if let Some(start_idx) = html.find("var userDailySubmissionsStats = [") {
        let rest = &html[start_idx + 32..];
        if let Some(end_idx) = rest.find("];") {
            let json_str = format!("{}]", &rest[..end_idx]);
            if let Ok(entries) = serde_json::from_str::<Vec<HeatmapEntry>>(&json_str) {
                let conn = db.lock().unwrap();
                let habit_id: i64 = conn.query_row(
                    "SELECT id FROM habits WHERE platform = 'codechef' AND type = 'problem'",
                    [],
                    |row| row.get(0),
                ).unwrap_or(3);

                for entry in entries {
                    if let (Some(mut date), Some(val)) = (entry.date, entry.value) {
                        if val > 0 {
                            // Codechef dates are like "2026-6-24", need zero-padding "2026-06-24"
                            let parts: Vec<&str> = date.split('-').collect();
                            if parts.len() == 3 {
                                let y = parts[0];
                                let m = format!("{:02}", parts[1].parse::<u32>().unwrap_or(0));
                                let d = format!("{:02}", parts[2].parse::<u32>().unwrap_or(0));
                                date = format!("{}-{}-{}", y, m, d);
                            }

                            // Insert `val` number of records to count as total problems solved
                            // Or just insert 1 completion. Since dashboard counts ALL completions,
                            // we need to insert `val` records with different titles to make them unique.
                            for i in 1..=val {
                                let title = format!("CodeChef Submission {}", i);
                                let _ = queries::insert_completion(
                                    &conn,
                                    habit_id,
                                    &date,
                                    "completed",
                                    Some(&title),
                                    None,
                                    "scraper",
                                    "desktop",
                                );
                            }
                            problems_found += val;
                        }
                    }
                }
            }
        }
    }

    // Parse Contest Data
    if let Some(start_idx) = html.find("\"date_versus_rating\":{\"all\":[") {
        let rest = &html[start_idx + 29..];
        if let Some(end_idx) = rest.find("],\"all_old\"") {
            let json_str = format!("[{}]", &rest[..end_idx]);
            if let Ok(entries) = serde_json::from_str::<Vec<ContestEntry>>(&json_str) {
                let conn = db.lock().unwrap();
                let contest_habit_id: i64 = conn.query_row(
                    "SELECT id FROM habits WHERE platform = 'codechef' AND type = 'contest'",
                    [],
                    |row| row.get(0),
                ).unwrap_or(1);

                for entry in entries {
                    if let Some(end_date) = entry.end_date {
                        let date = end_date.split(' ').next().unwrap_or("").to_string();
                        if !date.is_empty() {
                            let _ = queries::insert_completion(
                                &conn,
                                contest_habit_id,
                                &date,
                                "completed",
                                entry.name.as_deref(),
                                None,
                                "scraper",
                                "desktop",
                            );
                            contests_found += 1;
                        }
                    }
                }
            }
        }
    }

    let conn = db.lock().unwrap();
    if problems_found > 0 || contests_found > 0 {
        queries::log_sync(
            &conn,
            "codechef_scraper",
            "success",
            Some(&format!("Found {} submissions, {} contests", problems_found, contests_found)),
            Some(duration),
        )?;
    } else {
        queries::log_sync(
            &conn,
            "codechef_scraper",
            "success",
            Some("Profile scraped, no new data"),
            Some(duration),
        )?;
    }

    info!("CodeChef: scraped profile for {}", username);
    Ok(())
}

/// Check CodeChef Wednesday contest participation by checking the ratings page
/// Contests happen on Wednesday at 10:00 PM IST; we check at ~10:05 PM
pub async fn check_codechef_contest(_db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Relying on poll_codechef to pick up the updated date_versus_rating JSON
    // because that's much more reliable than parsing the unstructured HTML.
    // The main poll runs every 60 mins and will pick it up quickly.
    Ok(())
}

/// Backfill CodeChef data 
pub async fn backfill_codechef(db: &Arc<Mutex<Connection>>, _months: i32) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
    // poll_codechef already fetches the entire heatmap and contest history available on the profile!
    let _ = poll_codechef(db).await;
    Ok(0)
}
