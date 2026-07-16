use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use chrono::Datelike;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayState {
    pub date: String,
    pub completed: bool,
    pub partial: bool,
    pub has_violations: bool,
    pub completion_count: i32,
    pub total_habits: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HabitStatus {
    pub habit_name: String,
    pub platform: String,
    pub habit_type: String,
    pub status: String, // "completed", "none"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Violation {
    pub domain: String,
    pub visit_time: String,
    pub visit_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayDetail {
    pub date: String,
    pub habits: Vec<HabitStatus>,
    pub violations: Vec<Violation>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DashboardStats {
    pub total_problems_solved: i64,
    pub leetcode_solved: i64,
    pub codechef_solved: i64,
    pub leetcode_daily_solved: i64,
    pub tuf_modules: i64,
    pub leetcode_contests: i64,
    pub codechef_contests: i64,
    pub contests_participated: i64,
    pub completion_rate: f64,
    pub total_violations: i64,
    pub days_tracked: i64,
    pub current_streak: i64,
    pub best_streak: i64,
    pub avg_daily_completions: f64,
    pub top_violation_domains: Vec<DomainCount>,
    pub monthly_data: Vec<MonthlyPoint>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DomainCount {
    pub domain: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonthlyPoint {
    pub month: String,
    pub problems: i64,
    pub violations: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlacklistEntry {
    pub id: i64,
    pub domain: String,
    pub category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    pub source: String,
    pub status: String,
    pub timestamp: String,
    pub details: Option<String>,
}

/// Get day states for a full month (for calendar rendering)
pub fn get_month_data(conn: &Connection, year: i32, month: u32) -> Vec<DayState> {
    let date_prefix = format!("{:04}-{:02}", year, month);
    let days_in_month = days_in_month(year, month);

    let mut results = Vec::new();

    for day in 1..=days_in_month {
        let date = format!("{}-{:02}", date_prefix, day);
        let date_str = date.as_str();

        // Get active habits for this day of week
        let weekday = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .map(|d| weekday_short(&d))
            .unwrap_or_default();

        let total_habits: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM habits WHERE active = 1 AND (check_days IS NULL OR check_days LIKE ?)",
                params![format!("%{}%", weekday)],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let completion_count: i32 = conn
            .query_row(
                "SELECT COUNT(DISTINCT c.habit_id) FROM completions c
                 JOIN habits h ON c.habit_id = h.id
                 WHERE c.date = ? AND c.status = 'completed' AND h.active = 1",
                params![date_str],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let has_violations: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM violations WHERE date = ?",
                params![date_str],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        let completed = total_habits > 0 && completion_count >= total_habits;
        let partial = completion_count > 0 && !completed;

        results.push(DayState {
            date,
            completed,
            partial,
            has_violations,
            completion_count,
            total_habits,
        });
    }

    results
}

/// Get detailed information for a specific day
pub fn get_day_detail(conn: &Connection, date: &str) -> DayDetail {
    // Get all habits and their status for this date
    let weekday = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .ok()
        .map(|d| weekday_short(&d))
        .unwrap_or_default();

    let mut stmt = conn
        .prepare(
            "SELECT h.name, h.platform, h.type, h.check_days,
                    MAX(c.status)
             FROM habits h
             LEFT JOIN completions c ON h.id = c.habit_id AND c.date = ?
             WHERE h.active = 1
             GROUP BY h.id
             ORDER BY h.id",
        )
        .unwrap();

    let habits: Vec<HabitStatus> = stmt
        .query_map(params![date], |row| {
            let check_days: Option<String> = row.get(3)?;
            let habit_name: String = row.get(0)?;
            let platform: String = row.get(1)?;
            let habit_type: String = row.get(2)?;
            let status: Option<String> = row.get(4)?;

            // Check if this habit applies to this day
            let applies = match &check_days {
                None => true,
                Some(days) => days.contains(&weekday),
            };

            Ok((applies, HabitStatus {
                habit_name,
                platform,
                habit_type,
                status: status.unwrap_or_else(|| "none".to_string()),
            }))
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .filter(|(applies, _)| *applies)
        .map(|(_, h)| h)
        .collect();

    // Get violations for this date — deduplicated by domain (set)
    let mut vstmt = conn
        .prepare(
            "SELECT domain, MIN(visit_time) as first_visit, COUNT(*) as visit_count
             FROM violations WHERE date = ?
             GROUP BY domain
             ORDER BY first_visit DESC",
        )
        .unwrap();

    let violations: Vec<Violation> = vstmt
        .query_map(params![date], |row| {
            Ok(Violation {
                domain: row.get(0)?,
                visit_time: row.get(1)?,
                visit_count: row.get(2)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    DayDetail {
        date: date.to_string(),
        habits,
        violations,
    }
}

/// Get dashboard statistics for a given range
pub fn get_dashboard_stats(conn: &Connection, months_back: i32) -> DashboardStats {
    let start_date = chrono::Local::now()
        .date_naive()
        .checked_sub_months(chrono::Months::new(months_back as u32))
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "2020-01-01".to_string());

    let leetcode_solved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'leetcode' AND h.type = 'problem' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let codechef_solved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'codechef' AND h.type = 'problem' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let leetcode_daily_solved: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'leetcode' AND h.type = 'daily' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let tuf_modules: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'takeuforward' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let leetcode_contests: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'leetcode' AND h.type = 'contest' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let codechef_contests: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions c JOIN habits h ON c.habit_id = h.id
             WHERE h.platform = 'codechef' AND h.type = 'contest' AND c.status = 'completed' AND c.date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let contests_participated = leetcode_contests + codechef_contests;

    let total_violations: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT domain || date) FROM violations WHERE date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let days_tracked: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date) FROM completions WHERE date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Calculate completion rate
    let total_possible: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions WHERE date >= ?",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM completions WHERE date >= ? AND status = 'completed'",
            params![start_date],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let completion_rate = if total_possible > 0 {
        (total_completed as f64 / total_possible as f64) * 100.0
    } else {
        0.0
    };

    // Average daily completions
    let avg_daily_completions = if days_tracked > 0 {
        total_completed as f64 / days_tracked as f64
    } else {
        0.0
    };

    // Current streak: consecutive days (up to today) with at least 1 completion
    let current_streak = calculate_current_streak(conn);
    let best_streak = calculate_best_streak(conn, &start_date);

    // Top violation domains
    let mut domain_stmt = conn
        .prepare(
            "SELECT domain, COUNT(*) as cnt FROM violations
             WHERE date >= ?
             GROUP BY domain
             ORDER BY cnt DESC
             LIMIT 5",
        )
        .unwrap();

    let top_violation_domains: Vec<DomainCount> = domain_stmt
        .query_map(params![start_date], |row| {
            Ok(DomainCount {
                domain: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    // Monthly data for charts — include both problems and violations
    let mut monthly_stmt = conn
        .prepare(
            "SELECT strftime('%Y-%m', date) as month,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as problems
             FROM completions WHERE date >= ?
             GROUP BY month ORDER BY month",
        )
        .unwrap();

    let mut monthly_data: Vec<MonthlyPoint> = monthly_stmt
        .query_map(params![start_date], |row| {
            let month: String = row.get(0)?;
            let problems: i64 = row.get(1)?;
            Ok(MonthlyPoint {
                month,
                problems,
                violations: 0,
            })
        })
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    // Fill in violation counts per month
    if let Ok(mut vstmt) = conn.prepare(
        "SELECT strftime('%Y-%m', date) as month, COUNT(DISTINCT domain || date) as vcnt
         FROM violations WHERE date >= ?
         GROUP BY month",
    ) {
        let vdata: Vec<(String, i64)> = vstmt
            .query_map(params![start_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        for (vm, vc) in &vdata {
            if let Some(mp) = monthly_data.iter_mut().find(|m| &m.month == vm) {
                mp.violations = *vc;
            } else {
                monthly_data.push(MonthlyPoint {
                    month: vm.clone(),
                    problems: 0,
                    violations: *vc,
                });
            }
        }
        monthly_data.sort_by(|a, b| a.month.cmp(&b.month));
    }

    DashboardStats {
        total_problems_solved: leetcode_solved + codechef_solved,
        leetcode_solved,
        codechef_solved,
        leetcode_daily_solved,
        tuf_modules,
        leetcode_contests,
        codechef_contests,
        contests_participated,
        completion_rate,
        total_violations,
        days_tracked,
        current_streak,
        best_streak,
        avg_daily_completions,
        top_violation_domains,
        monthly_data,
    }
}

/// Calculate current streak (consecutive days ending today with at least 1 completion)
fn calculate_current_streak(conn: &Connection) -> i64 {
    let today = chrono::Local::now().date_naive();
    let mut streak = 0i64;
    let mut check_date = today;

    loop {
        let date_str = check_date.format("%Y-%m-%d").to_string();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM completions WHERE date = ? AND status = 'completed'",
                params![date_str],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if count > 0 {
            streak += 1;
            if let Some(prev) = check_date.pred_opt() {
                check_date = prev;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    streak
}

/// Calculate best streak within the given date range
fn calculate_best_streak(conn: &Connection, start_date: &str) -> i64 {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT date FROM completions
             WHERE date >= ? AND status = 'completed'
             ORDER BY date",
        )
        .unwrap();

    let dates: Vec<String> = stmt
        .query_map(params![start_date], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    if dates.is_empty() {
        return 0;
    }

    let mut best = 1i64;
    let mut current = 1i64;

    for i in 1..dates.len() {
        let prev = chrono::NaiveDate::parse_from_str(&dates[i - 1], "%Y-%m-%d");
        let curr = chrono::NaiveDate::parse_from_str(&dates[i], "%Y-%m-%d");

        if let (Ok(p), Ok(c)) = (prev, curr) {
            if c.signed_duration_since(p).num_days() == 1 {
                current += 1;
                if current > best {
                    best = current;
                }
            } else {
                current = 1;
            }
        }
    }

    best
}

/// Get all blacklist entries
pub fn get_blacklist(conn: &Connection) -> Vec<BlacklistEntry> {
    let mut stmt = conn
        .prepare("SELECT id, domain, category FROM blacklist ORDER BY domain")
        .unwrap();

    stmt.query_map([], |row| {
        Ok(BlacklistEntry {
            id: row.get(0)?,
            domain: row.get(1)?,
            category: row.get(2)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

/// Get blacklist as a simple domain list (for extension)
pub fn get_blacklist_domains(conn: &Connection) -> Vec<String> {
    let mut stmt = conn.prepare("SELECT domain FROM blacklist").unwrap();
    stmt.query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

/// Add a domain to the blacklist
pub fn add_blacklist_domain(conn: &Connection, domain: &str, category: Option<&str>) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR IGNORE INTO blacklist (domain, category) VALUES (?, ?)",
        params![domain, category],
    )?;
    Ok(())
}

/// Remove a domain from the blacklist
pub fn remove_blacklist_domain(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM blacklist WHERE id = ?", params![id])?;
    Ok(())
}

/// Insert a completion record
pub fn insert_completion(
    conn: &Connection,
    habit_id: i64,
    date: &str,
    status: &str,
    title: Option<&str>,
    url: Option<&str>,
    source: &str,
    device: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO completions (habit_id, date, status, title, url, source, device)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![habit_id, date, status, title, url, source, device],
    )?;
    Ok(())
}

/// Insert a violation record
pub fn insert_violation(
    conn: &Connection,
    domain: &str,
    full_url: Option<&str>,
    visit_time: &str,
    date: &str,
    browser: Option<&str>,
    profile: Option<&str>,
    device: &str,
    source: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO violations (domain, full_url, visit_time, date, browser, profile, device, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![domain, full_url, visit_time, date, browser, profile, device, source],
    )?;
    Ok(())
}

/// Log a sync event
pub fn log_sync(
    conn: &Connection,
    source: &str,
    status: &str,
    details: Option<&str>,
    duration_ms: Option<i64>,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO sync_log (source, status, timestamp, details, duration_ms)
         VALUES (?, ?, datetime('now'), ?, ?)",
        params![source, status, details, duration_ms],
    )?;
    Ok(())
}

/// Get recent sync statuses (for diagnostics)
pub fn get_sync_statuses(conn: &Connection) -> Vec<SyncStatus> {
    let mut stmt = conn
        .prepare(
            "SELECT source, status, timestamp, details
             FROM sync_log
             WHERE id IN (
                 SELECT MAX(id) FROM sync_log GROUP BY source
             )
             ORDER BY timestamp DESC",
        )
        .unwrap();

    stmt.query_map([], |row| {
        Ok(SyncStatus {
            source: row.get(0)?,
            status: row.get(1)?,
            timestamp: row.get(2)?,
            details: row.get(3)?,
        })
    })
    .unwrap()
    .filter_map(|r| r.ok())
    .collect()
}

/// Get/set settings
pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        params![key, value],
    )?;
    Ok(())
}

/// Check if initial setup has been completed
pub fn is_setup_complete(conn: &Connection) -> bool {
    get_setting(conn, "setup_complete").map_or(false, |v| v == "true")
}

// Helper functions
fn days_in_month(year: i32, month: u32) -> u32 {
    chrono::NaiveDate::from_ymd_opt(
        if month == 12 { year + 1 } else { year },
        if month == 12 { 1 } else { month + 1 },
        1,
    )
    .and_then(|d| d.pred_opt())
    .map(|d| d.day())
    .unwrap_or(30)
}

fn weekday_short(date: &chrono::NaiveDate) -> String {
    match date.weekday() {
        chrono::Weekday::Mon => "mon".to_string(),
        chrono::Weekday::Tue => "tue".to_string(),
        chrono::Weekday::Wed => "wed".to_string(),
        chrono::Weekday::Thu => "thu".to_string(),
        chrono::Weekday::Fri => "fri".to_string(),
        chrono::Weekday::Sat => "sat".to_string(),
        chrono::Weekday::Sun => "sun".to_string(),
    }
}
