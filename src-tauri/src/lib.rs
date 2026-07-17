mod db;
mod daemon;

use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{Manager, AppHandle};
use log::info;

use db::queries;

// ─── Tauri IPC Commands ──────────────────────────────────────────────────────

#[tauri::command]
fn get_month_data(state: tauri::State<'_, AppState>, year: i32, month: u32) -> Vec<queries::DayState> {
    let conn = state.db.lock().unwrap();
    queries::get_month_data(&conn, year, month)
}

#[tauri::command]
fn get_day_detail(state: tauri::State<'_, AppState>, date: String) -> queries::DayDetail {
    let conn = state.db.lock().unwrap();
    queries::get_day_detail(&conn, &date)
}

#[tauri::command]
fn get_dashboard_stats(state: tauri::State<'_, AppState>, months_back: i32) -> queries::DashboardStats {
    let conn = state.db.lock().unwrap();
    queries::get_dashboard_stats(&conn, months_back)
}

#[tauri::command]
fn get_blacklist(state: tauri::State<'_, AppState>) -> Vec<queries::BlacklistEntry> {
    let conn = state.db.lock().unwrap();
    queries::get_blacklist(&conn)
}

#[tauri::command]
fn add_blacklist_domain(state: tauri::State<'_, AppState>, domain: String, category: Option<String>) -> bool {
    let conn = state.db.lock().unwrap();
    queries::add_blacklist_domain(&conn, &domain, category.as_deref()).is_ok()
}

#[tauri::command]
fn remove_blacklist_domain(state: tauri::State<'_, AppState>, id: i64) -> bool {
    let conn = state.db.lock().unwrap();
    queries::remove_blacklist_domain(&conn, id).is_ok()
}

#[tauri::command]
fn get_setting(state: tauri::State<'_, AppState>, key: String) -> Option<String> {
    let conn = state.db.lock().unwrap();
    queries::get_setting(&conn, &key)
}

#[tauri::command]
fn save_setting(state: tauri::State<'_, AppState>, key: String, value: String) -> bool {
    let conn = state.db.lock().unwrap();
    queries::set_setting(&conn, &key, &value).is_ok()
}

#[tauri::command]
fn is_setup_complete(state: tauri::State<'_, AppState>) -> bool {
    let conn = state.db.lock().unwrap();
    queries::is_setup_complete(&conn)
}

#[tauri::command]
fn get_diagnostics(state: tauri::State<'_, AppState>) -> DiagnosticsInfo {
    let conn = state.db.lock().unwrap();
    let sync_statuses = queries::get_sync_statuses(&conn);
    let server_port = state.server_port;
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
        
    DiagnosticsInfo {
        sync_statuses,
        server_port,
        db_path: db::get_db_path().to_string_lossy().to_string(),
        local_ip,
    }
}

#[tauri::command]
async fn run_backfill(state: tauri::State<'_, AppState>, platform: String, months: i32) -> Result<String, String> {
    let db = state.db.clone();
    match platform.as_str() {
        "leetcode" => {
            let count = daemon::leetcode::backfill_leetcode(&db, months)
                .await
                .map_err(|e| e.to_string())?;
            Ok(format!("Imported {} LeetCode submissions", count))
        }
        "codechef" => {
            let count = daemon::codechef::backfill_codechef(&db, months)
                .await
                .map_err(|e| e.to_string())?;
            Ok(format!("Imported {} CodeChef entries", count))
        }
        _ => Err(format!("Unknown platform: {}", platform)),
    }
}

#[tauri::command]
async fn reset_and_backfill(state: tauri::State<'_, AppState>) -> Result<String, String> {
    info!("Starting backfill process without dropping existing data");

    // Step 2: Backfill LeetCode data (6 months)
    let db = state.db.clone();
    let lc_count = daemon::leetcode::backfill_leetcode(&db, 6)
        .await
        .map_err(|e| e.to_string())?;

    // Step 3: Check daily problem
    let _ = daemon::leetcode::check_daily_problem(&db).await;

    // Step 4: Poll CodeChef
    let _ = daemon::codechef::poll_codechef(&db).await;

    Ok(format!("Reset complete. Backfilled {} LeetCode submissions + contest history.", lc_count))
}

#[tauri::command]
async fn validate_username(platform: String, username: String) -> Result<bool, String> {
    let client = reqwest::Client::new();
    match platform.as_str() {
        "leetcode" => {
            let query = serde_json::json!({
                "query": "query userProfile($username: String!) { matchedUser(username: $username) { username } }",
                "variables": { "username": username }
            });
            let resp = client
                .post("https://leetcode.com/graphql")
                .header("Content-Type", "application/json")
                .json(&query)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
            Ok(body["data"]["matchedUser"]["username"].is_string())
        }
        "codechef" => {
            let url = format!("https://www.codechef.com/users/{}", username);
            let resp = client
                .get(&url)
                .header("User-Agent", "Mozilla/5.0")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            Ok(resp.status().is_success())
        }
        _ => Err(format!("Unknown platform: {}", platform)),
    }
}

// ─── Device Management Commands ──────────────────────────────────────────────

#[tauri::command]
async fn add_device(state: tauri::State<'_, AppState>, ip: String, name: String) -> Result<String, String> {
    let db = state.db.clone();
    let port = 19848u16;
    daemon::devices::add_device(&db, &ip, &name, port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_devices(state: tauri::State<'_, AppState>) -> Vec<daemon::devices::ConnectedDevice> {
    let conn = state.db.lock().unwrap();
    queries::get_connected_devices(&conn)
}

#[tauri::command]
async fn sync_device(state: tauri::State<'_, AppState>, device_id: String) -> Result<String, String> {
    let db = state.db.clone();
    daemon::devices::sync_all_devices(&db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Sync complete for device {}", device_id))
}

#[tauri::command]
fn remove_device(state: tauri::State<'_, AppState>, device_id: String) -> bool {
    let conn = state.db.lock().unwrap();
    queries::remove_connected_device(&conn, &device_id).is_ok()
}

#[tauri::command]
fn check_full_disk_access() -> bool {
    // On macOS, try to read Chrome's history file as a permission check
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let chrome_history = home.join("Library/Application Support/Google/Chrome/Default/History");
            if chrome_history.exists() {
                return std::fs::metadata(&chrome_history)
                    .map(|m| m.len() > 0)
                    .unwrap_or(false);
            }
        }
    }
    true // Non-macOS platforms don't need this check
}

// ─── App State ───────────────────────────────────────────────────────────────

pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub server_port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiagnosticsInfo {
    pub sync_statuses: Vec<queries::SyncStatus>,
    pub server_port: u16,
    pub db_path: String,
    pub local_ip: String,
}

// ─── App Entry Point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Initialize database
    let conn = db::init_db().expect("Failed to initialize database");
    let db = Arc::new(Mutex::new(conn));

    // Find an available port for the extension server
    let server_port = find_available_port().unwrap_or(19847);

    // Store the port in settings so the extension can discover it
    {
        let conn = db.lock().unwrap();
        let _ = queries::set_setting(&conn, "server_port", &server_port.to_string());
    }

    let daemon_db = db.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(AppState {
            db: db.clone(),
            server_port,
        })
        .setup(move |app| {
            // Set up system tray
            setup_tray(app.handle())?;

            // Show the main window (it starts hidden for tray-only autostart)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Start daemon in background with app handle for event emission
            let daemon_db = daemon_db.clone();
            let port = server_port;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                daemon::start_daemon(daemon_db, port, app_handle).await;
            });

            info!("Habit Calendar started. Extension server on port {}", server_port);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window instead of closing (keep daemon running)
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_month_data,
            get_day_detail,
            get_dashboard_stats,
            get_blacklist,
            add_blacklist_domain,
            remove_blacklist_domain,
            get_setting,
            save_setting,
            is_setup_complete,
            get_diagnostics,
            run_backfill,
            reset_and_backfill,
            validate_username,
            add_device,
            get_devices,
            sync_device,
            remove_device,
            check_full_disk_access,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                use tauri::Manager;
                if let Some(window) = _app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
}

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let show = MenuItemBuilder::with_id("show", "Show Calendar").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

    let _tray = TrayIconBuilder::new()
        .tooltip("Habit Calendar")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn find_available_port() -> Option<u16> {
    // Try the default port first, then scan the known range that
    // the browser extension also scans (19840..=19860).
    for port in std::iter::once(19847u16).chain(19840u16..=19860) {
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return Some(port);
        }
    }
    // Absolute fallback to OS-assigned ephemeral port
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
}
