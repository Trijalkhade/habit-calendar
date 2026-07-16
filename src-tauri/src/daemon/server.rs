use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use log::info;

use crate::db::queries;

#[derive(Clone)]
pub struct ServerState {
    pub db: Arc<Mutex<Connection>>,
}

#[derive(Debug, Deserialize)]
pub struct ExtensionEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub url: Option<String>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BlacklistEvent {
    pub domain: String,
    pub url: Option<String>,
    pub timestamp: Option<String>,
    pub browser: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Serialize)]
pub struct BlacklistResponse {
    pub domains: Vec<String>,
}

/// Start the localhost HTTP server for browser extension communication
pub async fn start_server(db: Arc<Mutex<Connection>>, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let state = ServerState { db };

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/event", post(event_handler))
        .route("/blacklist-check", post(blacklist_event_handler))
        .route("/blacklist-domains", get(get_blacklist_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    info!("Extension server listening on 0.0.0.0:{}", port);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_handler() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: "0.1.0".to_string(),
    })
}

async fn event_handler(
    State(state): State<ServerState>,
    Json(event): Json<ExtensionEvent>,
) -> StatusCode {
    let conn = state.db.lock().unwrap();

    let now = chrono::Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    let timestamp = event.timestamp.unwrap_or_else(|| now.format("%Y-%m-%dT%H:%M:%S").to_string());

    match event.event_type.as_str() {
        "leetcode_accepted" => {
            let habit_id: i64 = conn
                .query_row(
                    "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'problem'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(1);

            let _ = queries::insert_completion(
                &conn,
                habit_id,
                &today,
                "completed",
                event.title.as_deref(),
                event.url.as_deref(),
                "extension",
                "desktop",
            );
            info!("Extension: LeetCode accepted submission recorded");
        }
        "tuf_complete" => {
            let habit_id: i64 = conn
                .query_row(
                    "SELECT id FROM habits WHERE platform = 'takeuforward' AND type = 'module'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or(3);

            let _ = queries::insert_completion(
                &conn,
                habit_id,
                &today,
                "completed",
                event.title.as_deref(),
                event.url.as_deref(),
                "extension",
                "desktop",
            );
            info!("Extension: TakeUForward module completion recorded");
        }
        _ => {
            info!("Extension: Unknown event type: {}", event.event_type);
        }
    }

    StatusCode::OK
}

async fn blacklist_event_handler(
    State(state): State<ServerState>,
    Json(event): Json<BlacklistEvent>,
) -> StatusCode {
    let conn = state.db.lock().unwrap();

    let now = chrono::Local::now();
    let today = now.format("%Y-%m-%d").to_string();
    let timestamp = event
        .timestamp
        .unwrap_or_else(|| now.format("%Y-%m-%dT%H:%M:%S").to_string());

    let _ = queries::insert_violation(
        &conn,
        &event.domain,
        event.url.as_deref(),
        &timestamp,
        &today,
        None,
        None,
        "desktop",
        "extension",
    );

    info!("Extension: blacklist violation recorded for {}", event.domain);
    StatusCode::OK
}

async fn get_blacklist_handler(State(state): State<ServerState>) -> Json<BlacklistResponse> {
    let conn = state.db.lock().unwrap();
    let domains = queries::get_blacklist_domains(&conn);
    Json(BlacklistResponse { domains })
}
