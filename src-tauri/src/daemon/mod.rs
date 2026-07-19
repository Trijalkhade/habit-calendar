pub mod leetcode;
pub mod codechef;
pub mod history;
pub mod server;
pub mod devices;

use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use tokio::time::{interval, Duration};
use log::{info, error, warn};
use tauri::{AppHandle, Emitter};

use crate::db::queries;

pub struct DaemonState {
    pub db: Arc<Mutex<Connection>>,
    pub server_port: u16,
    pub app_handle: AppHandle,
}

/// Emit a data-updated event to the frontend for instant UI refresh
fn emit_update(app_handle: &AppHandle, source: &str) {
    if let Err(e) = app_handle.emit("data-updated", source) {
        warn!("Failed to emit data-updated event: {}", e);
    }
}

/// Calculate how long the app has been offline since last successful sync
fn get_offline_gap_hours(db: &Arc<Mutex<Connection>>) -> f64 {
    let conn = db.lock().unwrap();
    if let Some(last_ts) = queries::get_last_sync_time(&conn) {
        if let Ok(last) = chrono::NaiveDateTime::parse_from_str(&last_ts, "%Y-%m-%d %H:%M:%S") {
            let now = chrono::Local::now().naive_local();
            let duration = now.signed_duration_since(last);
            return duration.num_minutes() as f64 / 60.0;
        }
    }
    // If no sync history, assume a large gap to trigger full catch-up
    999.0
}

/// Start all daemon background tasks
pub async fn start_daemon(db: Arc<Mutex<Connection>>, server_port: u16, app_handle: AppHandle) {
    let _state = Arc::new(DaemonState {
        db: db.clone(),
        server_port,
        app_handle: app_handle.clone(),
    });

    // Start the localhost HTTP server for browser extension communication
    let server_db = db.clone();
    tokio::spawn(async move {
        info!("Starting extension server on port {}", server_port);
        if let Err(e) = server::start_server(server_db, server_port).await {
            error!("Extension server error: {}", e);
        }
    });

    // LeetCode polling (every 30 minutes)
    let lc_db = db.clone();
    let lc_handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(120 * 60));
        loop {
            interval.tick().await;
            info!("Polling LeetCode...");
            if let Err(e) = leetcode::poll_leetcode(&lc_db).await {
                error!("LeetCode poll error: {}", e);
            } else {
                emit_update(&lc_handle, "leetcode_poll");
            }
        }
    });

    // LeetCode daily problem check (every 30 minutes)
    let daily_db = db.clone();
    let daily_handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(120 * 60));
        loop {
            interval.tick().await;
            info!("Checking LeetCode daily problem...");
            if let Err(e) = leetcode::check_daily_problem(&daily_db).await {
                error!("LeetCode daily check error: {}", e);
            } else {
                emit_update(&daily_handle, "leetcode_daily");
            }
        }
    });

    // CodeChef polling (every 60 minutes)
    let cc_db = db.clone();
    let cc_handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(120 * 60));
        loop {
            interval.tick().await;
            info!("Polling CodeChef...");
            if let Err(e) = codechef::poll_codechef(&cc_db).await {
                error!("CodeChef poll error: {}", e);
            } else {
                emit_update(&cc_handle, "codechef_poll");
            }
            // Also check for Wednesday contest participation
            if let Err(e) = codechef::check_codechef_contest(&cc_db).await {
                error!("CodeChef contest check error: {}", e);
            }
        }
    });

    // Browser history scanning (every 15 minutes)
    let hist_db = db.clone();
    let hist_handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(15 * 60));
        loop {
            interval.tick().await;
            info!("Scanning browser history...");
            if let Err(e) = history::scan_browser_history(&hist_db, 7) {
                error!("History scan error: {}", e);
            } else {
                emit_update(&hist_handle, "history_scan");
            }
        }
    });

    // Device sync polling (every 15 minutes)
    let dev_db = db.clone();
    let dev_handle = app_handle.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(15 * 60));
        loop {
            interval.tick().await;
            info!("Syncing connected devices...");
            if let Err(e) = devices::sync_all_devices(&dev_db).await {
                error!("Device sync error: {}", e);
            } else {
                emit_update(&dev_handle, "device_sync");
            }
        }
    });

    // Run initial catch-up after a short delay
    let init_db = db.clone();
    let init_handle = app_handle.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;

        let offline_hours = get_offline_gap_hours(&init_db);
        let offline_days = (offline_hours / 24.0).ceil() as i32;

        if offline_hours > 1.0 {
            info!("Offline for {:.1} hours ({} days). Running full catch-up...", offline_hours, offline_days);

            // Deep history scan covering the full offline window (capped at 180 days)
            let scan_days = std::cmp::min(offline_days + 1, 180);
            info!("Deep history scan covering {} days...", scan_days);
            let _ = history::scan_browser_history(&init_db, scan_days);
            emit_update(&init_handle, "history_catchup");

            // Full LeetCode sync
            let _ = leetcode::poll_leetcode(&init_db).await;
            let _ = leetcode::check_daily_problem(&init_db).await;
            emit_update(&init_handle, "leetcode_catchup");

            // Full CodeChef sync
            let _ = codechef::poll_codechef(&init_db).await;
            let _ = codechef::check_codechef_contest(&init_db).await;
            emit_update(&init_handle, "codechef_catchup");

            // Device sync catch-up
            let _ = devices::sync_all_devices(&init_db).await;
            emit_update(&init_handle, "device_catchup");
        } else {
            info!("Running initial data collection (online for < 1 hour)...");
            let _ = leetcode::poll_leetcode(&init_db).await;
            let _ = leetcode::check_daily_problem(&init_db).await;
            let _ = codechef::poll_codechef(&init_db).await;
            let _ = codechef::check_codechef_contest(&init_db).await;
            let _ = history::scan_browser_history(&init_db, 7);
            let _ = devices::sync_all_devices(&init_db).await;
            emit_update(&init_handle, "initial_sync");
        }

        info!("Initial data collection complete.");
    });
}
