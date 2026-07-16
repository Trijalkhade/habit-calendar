use rusqlite::Connection;
use std::path::PathBuf;

pub mod queries;
pub mod schema;

pub fn get_db_path() -> PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("habit-calendar");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("habits.db")
}

pub fn init_db() -> Result<Connection, rusqlite::Error> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    schema::create_tables(&conn)?;
    schema::seed_defaults(&conn)?;
    Ok(conn)
}
