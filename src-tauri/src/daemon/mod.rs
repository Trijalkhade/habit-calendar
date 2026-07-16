pub mod leetcode;
pub mod codechef;
pub mod history;
pub mod server;

use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use tokio::time::{interval, Duration};
use log::{info, error};

pub struct DaemonState {
    pub db: Arc<Mutex<Connection>>,
    pub server_port: u16,
}

/// Start all daemon background tasks
pub async fn start_daemon(db: Arc<Mutex<Connection>>, server_port: u16) {
    let state = Arc::new(DaemonState {
        db: db.clone(),
        server_port,
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
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(30 * 60));
        loop {
            interval.tick().await;
            info!("Polling LeetCode...");
            if let Err(e) = leetcode::poll_leetcode(&lc_db).await {
                error!("LeetCode poll error: {}", e);
            }
        }
    });

    // LeetCode daily problem check (every 30 minutes)
    let daily_db = db.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(30 * 60));
        loop {
            interval.tick().await;
            info!("Checking LeetCode daily problem...");
            if let Err(e) = leetcode::check_daily_problem(&daily_db).await {
                error!("LeetCode daily check error: {}", e);
            }
        }
    });

    // CodeChef polling (every 60 minutes)
    let cc_db = db.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(60 * 60));
        loop {
            interval.tick().await;
            info!("Polling CodeChef...");
            if let Err(e) = codechef::poll_codechef(&cc_db).await {
                error!("CodeChef poll error: {}", e);
            }
            // Also check for Wednesday contest participation
            if let Err(e) = codechef::check_codechef_contest(&cc_db).await {
                error!("CodeChef contest check error: {}", e);
            }
        }
    });

    // Browser history scanning (every 15 minutes)
    let hist_db = db.clone();
    tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(15 * 60));
        loop {
            interval.tick().await;
            info!("Scanning browser history...");
            if let Err(e) = history::scan_browser_history(&hist_db) {
                error!("History scan error: {}", e);
            }
        }
    });

    // Run initial polls immediately after a short delay
    let init_db = db.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(5)).await;
        info!("Running initial data collection...");
        let _ = leetcode::poll_leetcode(&init_db).await;
        let _ = leetcode::check_daily_problem(&init_db).await;
        let _ = codechef::poll_codechef(&init_db).await;
        let _ = codechef::check_codechef_contest(&init_db).await;
        let _ = history::scan_browser_history(&init_db);
    });
}
