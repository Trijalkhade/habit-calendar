use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use log::{info, warn};
use serde::{Deserialize, Serialize};

use crate::db::queries;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectedDevice {
    pub id: String,
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub last_connected: Option<String>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct HandshakeResponse {
    pub device_name: Option<String>,
    pub os: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HistoryEntry {
    pub url: String,
    pub visit_time: String,
    pub browser: Option<String>,
}

/// Sync all connected devices — pull history from each reachable device
pub async fn sync_all_devices(db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let devices = {
        let conn = db.lock().unwrap();
        queries::get_connected_devices(&conn)
    };

    if devices.is_empty() {
        return Ok(());
    }

    let blacklist: std::collections::HashSet<String> = {
        let conn = db.lock().unwrap();
        queries::get_blacklist_domains(&conn).into_iter().collect()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    for device in &devices {
        match sync_single_device(db, &client, device, &blacklist).await {
            Ok(count) => {
                if count > 0 {
                    info!("Synced {} history entries from device '{}'", count, device.name);
                }
                let conn = db.lock().unwrap();
                let _ = queries::update_device_status(&conn, &device.id, "online");
                let _ = queries::update_device_last_connected(&conn, &device.id);
            }
            Err(e) => {
                warn!("Failed to sync device '{}' ({}): {}", device.name, device.ip, e);
                let conn = db.lock().unwrap();
                let _ = queries::update_device_status(&conn, &device.id, "offline");
            }
        }
    }

    Ok(())
}

/// Sync a single device — check health, pull history, analyze for blacklisted visits
async fn sync_single_device(
    db: &Arc<Mutex<Connection>>,
    client: &reqwest::Client,
    device: &ConnectedDevice,
    blacklist: &std::collections::HashSet<String>,
) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
    let base_url = format!("http://{}:{}", device.ip, device.port);

    // Health check
    let health_resp = client
        .get(format!("{}/health", base_url))
        .send()
        .await?;

    if !health_resp.status().is_success() {
        return Err("Device health check failed".into());
    }

    // Determine since-timestamp: last_connected or 6 months ago
    let since = device.last_connected.clone().unwrap_or_else(|| {
        let six_months_ago = chrono::Local::now()
            .checked_sub_months(chrono::Months::new(6))
            .map(|d| d.format("%Y-%m-%dT%H:%M:%S").to_string())
            .unwrap_or_else(|| "2020-01-01T00:00:00".to_string());
        six_months_ago
    });

    // Pull history
    let history_url = format!("{}/history?since={}", base_url, since);
    let history_resp = client.get(&history_url).send().await?;

    if !history_resp.status().is_success() {
        return Err(format!("History fetch failed: HTTP {}", history_resp.status()).into());
    }

    let entries: Vec<HistoryEntry> = history_resp.json().await?;
    let mut violations_count = 0;

    let conn = db.lock().unwrap();
    let device_label = format!("phone:{}", device.name);

    for entry in &entries {
        if let Some(domain) = extract_domain(&entry.url) {
            let is_blacklisted = blacklist.contains(&domain)
                || blacklist.iter().any(|bl| domain.ends_with(&format!(".{}", bl)));

            if is_blacklisted {
                let visit_date = if entry.visit_time.len() >= 10 {
                    &entry.visit_time[..10]
                } else {
                    continue;
                };

                let _ = queries::insert_violation(
                    &conn,
                    &domain,
                    Some(&entry.url),
                    &entry.visit_time,
                    visit_date,
                    entry.browser.as_deref(),
                    None,
                    &device_label,
                    "device_sync",
                );
                violations_count += 1;
            }
        }
    }

    let _ = queries::log_sync(
        &conn,
        "device_sync",
        "success",
        Some(&format!("Synced {} entries from '{}', found {} violations", entries.len(), device.name, violations_count)),
        None,
    );

    Ok(violations_count)
}

/// Add a new device by IP — performs handshake to verify companion app is running
pub async fn add_device(
    db: &Arc<Mutex<Connection>>,
    ip: &str,
    name: &str,
    port: u16,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let base_url = format!("http://{}:{}", ip, port);
    let resp = client.get(format!("{}/handshake", base_url)).send().await?;

    if !resp.status().is_success() {
        return Err("Could not connect to companion app. Make sure it's running.".into());
    }

    let handshake: HandshakeResponse = resp.json().await?;
    let device_name = handshake.device_name.unwrap_or_else(|| name.to_string());

    let device_id = format!("dev_{}", uuid_simple());

    let conn = db.lock().unwrap();
    queries::add_connected_device(&conn, &device_id, &device_name, ip, port)?;

    info!("Added device '{}' at {}:{}", device_name, ip, port);
    Ok(device_id)
}

/// Extract domain from a URL
fn extract_domain(url: &str) -> Option<String> {
    let url = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let domain = url.split('/').next()?;
    let domain = domain.split(':').next()?;
    Some(domain.to_lowercase())
}

/// Simple UUID generator (no external dependency)
fn uuid_simple() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{:x}", ts)
}
