use rusqlite::Connection;

pub fn create_tables(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            platform TEXT NOT NULL,
            type TEXT NOT NULL,
            check_days TEXT,
            active INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL REFERENCES habits(id),
            date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'none',
            title TEXT,
            url TEXT,
            source TEXT NOT NULL,
            device TEXT DEFAULT 'desktop',
            raw_data TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(habit_id, date, title)
        );

        CREATE TABLE IF NOT EXISTS blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL UNIQUE,
            category TEXT,
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS violations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            full_url TEXT,
            visit_time TEXT NOT NULL,
            date TEXT NOT NULL,
            browser TEXT,
            profile TEXT,
            device TEXT DEFAULT 'desktop',
            source TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            details TEXT,
            duration_ms INTEGER
        );

        CREATE TABLE IF NOT EXISTS sync_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL UNIQUE,
            imported_at TEXT DEFAULT (datetime('now')),
            event_count INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);
        CREATE INDEX IF NOT EXISTS idx_completions_habit_date ON completions(habit_id, date);
        CREATE INDEX IF NOT EXISTS idx_violations_date ON violations(date);
        CREATE INDEX IF NOT EXISTS idx_sync_log_source ON sync_log(source, timestamp);

        CREATE TABLE IF NOT EXISTS scan_cursors (
            browser TEXT NOT NULL,
            profile TEXT NOT NULL,
            last_visit_time INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (browser, profile)
        );

        CREATE TABLE IF NOT EXISTS connected_devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            ip TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 19848,
            last_connected TEXT,
            status TEXT NOT NULL DEFAULT 'offline',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_violations_device ON violations(device);
        ",
    )?;
    Ok(())
}

pub fn seed_defaults(conn: &Connection) -> Result<(), rusqlite::Error> {
    // Seed habit definitions if table is empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM habits", [], |row| row.get(0))?;
    if count == 0 {
        conn.execute_batch(
            "
            INSERT INTO habits (name, platform, type, check_days) VALUES
                ('Codechef Weekly Contest', 'codechef', 'contest', 'wed'),
                ('Leetcode Weekly Contest', 'leetcode', 'contest', 'sat,sun'),
                ('Codechef Problem Solved', 'codechef', 'problem', NULL),
                ('Leetcode Problem Solved', 'leetcode', 'problem', NULL),
                ('Leetcode Daily Problem', 'leetcode', 'daily', NULL),
                ('TakeUForward Module', 'takeuforward', 'module', NULL);
            ",
        )?;
    }

    // Seed default blacklist if empty
    let bl_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM blacklist", [], |row| row.get(0))?;
    if bl_count == 0 {
        conn.execute_batch(
            "
            INSERT INTO blacklist (domain, category) VALUES
                ('instagram.com', 'social'),
                ('twitter.com', 'social'),
                ('x.com', 'social'),
                ('facebook.com', 'social'),
                ('reddit.com', 'social'),
                ('youtube.com', 'entertainment'),
                ('netflix.com', 'entertainment'),
                ('tiktok.com', 'social'),
                ('snapchat.com', 'social'),
                ('twitch.tv', 'entertainment');
            ",
        )?;
    }
    Ok(())
}

/// One-time reset: clear all data and re-seed habits with the correct 6-item checklist
pub fn reset_data(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        DELETE FROM completions;
        DELETE FROM violations;
        DELETE FROM sync_log;
        DELETE FROM sync_files;
        DELETE FROM habits;
        ",
    )?;
    // Re-seed with the correct habit definitions
    conn.execute_batch(
        "
        INSERT INTO habits (name, platform, type, check_days) VALUES
            ('Codechef Weekly Contest', 'codechef', 'contest', 'wed'),
            ('Leetcode Weekly Contest', 'leetcode', 'contest', 'sat,sun'),
            ('Codechef Problem Solved', 'codechef', 'problem', NULL),
            ('Leetcode Problem Solved', 'leetcode', 'problem', NULL),
            ('Leetcode Daily Problem', 'leetcode', 'daily', NULL),
            ('TakeUForward Module', 'takeuforward', 'module', NULL);
        ",
    )?;
    Ok(())
}
