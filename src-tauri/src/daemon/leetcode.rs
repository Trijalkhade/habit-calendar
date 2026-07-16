use rusqlite::Connection;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use log::{info, warn, error};

use crate::db::queries;

#[derive(Debug, Deserialize)]
struct LeetCodeResponse {
    data: Option<LeetCodeData>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeData {
    #[serde(rename = "recentAcSubmissionList")]
    recent_ac_submission_list: Option<Vec<LeetCodeSubmission>>,
    #[serde(rename = "userContestRanking")]
    user_contest_ranking: Option<LeetCodeContestRanking>,
    #[serde(rename = "userContestRankingHistory")]
    user_contest_ranking_history: Option<Vec<LeetCodeContestHistory>>,
    #[serde(rename = "activeDailyCodingChallengeQuestion")]
    active_daily: Option<DailyChallenge>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeSubmission {
    id: Option<String>,
    title: Option<String>,
    #[serde(rename = "titleSlug")]
    title_slug: Option<String>,
    timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeContestRanking {
    #[serde(rename = "attendedContestsCount")]
    attended_contests_count: Option<i64>,
    rating: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeContestHistory {
    attended: Option<bool>,
    #[serde(rename = "trendDirection")]
    trend_direction: Option<String>,
    contest: Option<LeetCodeContest>,
    ranking: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct LeetCodeContest {
    title: Option<String>,
    #[serde(rename = "startTime")]
    start_time: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct DailyChallenge {
    date: Option<String>,
    link: Option<String>,
    question: Option<DailyQuestion>,
}

#[derive(Debug, Deserialize)]
struct DailyQuestion {
    title: Option<String>,
    #[serde(rename = "titleSlug")]
    title_slug: Option<String>,
}

/// Poll LeetCode's GraphQL API for recent accepted submissions
pub async fn poll_leetcode(db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let start = Instant::now();

    let username = {
        let conn = db.lock().unwrap();
        queries::get_setting(&conn, "leetcode_username")
    };

    let username = match username {
        Some(u) if !u.is_empty() => u,
        _ => {
            info!("No LeetCode username configured, skipping poll");
            return Ok(());
        }
    };

    let client = reqwest::Client::new();

    // Query recent accepted submissions
    let submissions_query = serde_json::json!({
        "query": "query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { id title titleSlug timestamp } }",
        "variables": {
            "username": username,
            "limit": 50
        }
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&submissions_query)
        .send()
        .await?;

    if resp.status() == 429 || resp.status() == 403 {
        let conn = db.lock().unwrap();
        queries::log_sync(&conn, "leetcode_api", "rate_limited", Some("Rate limited or blocked"), None)?;
        warn!("LeetCode API rate limited");
        return Ok(());
    }

    let data: LeetCodeResponse = resp.json().await?;
    let duration = start.elapsed().as_millis() as i64;

    if let Some(data) = data.data {
        if let Some(submissions) = data.recent_ac_submission_list {
            let conn = db.lock().unwrap();
            let habit_id: i64 = conn.query_row(
                "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'problem'",
                [],
                |row| row.get(0),
            )?;

            let mut count = 0;
            for sub in &submissions {
                if let Some(timestamp) = &sub.timestamp {
                    if let Ok(ts) = timestamp.parse::<i64>() {
                        let date = chrono::DateTime::from_timestamp(ts, 0)
                            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
                            .unwrap_or_default();

                        if !date.is_empty() {
                            let title = sub.title.as_deref();
                            let url = sub.title_slug.as_ref().map(|s| format!("https://leetcode.com/problems/{}/", s));
                            let _ = queries::insert_completion(
                                &conn,
                                habit_id,
                                &date,
                                "completed",
                                title,
                                url.as_deref(),
                                "api_poll",
                                "desktop",
                            );
                            count += 1;
                        }
                    }
                }
            }

            queries::log_sync(
                &conn,
                "leetcode_api",
                "success",
                Some(&format!("Imported {} submissions for user {}", count, username)),
                Some(duration),
            )?;
            info!("LeetCode: imported {} submissions", count);
        }
    } else {
        let conn = db.lock().unwrap();
        queries::log_sync(
            &conn,
            "leetcode_api",
            "error",
            Some("No data in response"),
            Some(duration),
        )?;
    }

    // Also query contest history
    let contest_query = serde_json::json!({
        "query": "query userContestRankingInfo($username: String!) { userContestRanking(username: $username) { attendedContestsCount rating } userContestRankingHistory(username: $username) { attended contest { title startTime } ranking } }",
        "variables": { "username": username }
    });

    if let Ok(resp) = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&contest_query)
        .send()
        .await
    {
        if let Ok(data) = resp.json::<LeetCodeResponse>().await {
            if let Some(data) = data.data {
                if let Some(history) = data.user_contest_ranking_history {
                    let conn = db.lock().unwrap();
                    let contest_habit_id: i64 = conn.query_row(
                        "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'contest'",
                        [],
                        |row| row.get(0),
                    ).unwrap_or(2);

                    for entry in &history {
                        if entry.attended.unwrap_or(false) {
                            if let Some(contest) = &entry.contest {
                                if let Some(start_time) = contest.start_time {
                                    let date = chrono::DateTime::from_timestamp(start_time, 0)
                                        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
                                        .unwrap_or_default();
                                    
                                    if !date.is_empty() {
                                        let title = contest.title.as_deref();
                                        let _ = queries::insert_completion(
                                            &conn,
                                            contest_habit_id,
                                            &date,
                                            "completed",
                                            title,
                                            None,
                                            "api_poll",
                                            "desktop",
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Check if the user has solved today's LeetCode daily challenge
pub async fn check_daily_problem(db: &Arc<Mutex<Connection>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let username = {
        let conn = db.lock().unwrap();
        queries::get_setting(&conn, "leetcode_username")
    };

    let username = match username {
        Some(u) if !u.is_empty() => u,
        _ => return Ok(()),
    };

    let client = reqwest::Client::new();

    // Step 1: Get today's daily challenge question
    let daily_query = serde_json::json!({
        "query": "query { activeDailyCodingChallengeQuestion { date link question { title titleSlug } } }"
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&daily_query)
        .send()
        .await?;

    if !resp.status().is_success() {
        warn!("Failed to fetch daily challenge: HTTP {}", resp.status());
        return Ok(());
    }

    let data: LeetCodeResponse = resp.json().await?;
    let daily = data.data.and_then(|d| d.active_daily);

    let (daily_slug, daily_title) = match &daily {
        Some(d) => {
            let slug = d.question.as_ref().and_then(|q| q.title_slug.clone());
            let title = d.question.as_ref().and_then(|q| q.title.clone());
            match slug {
                Some(s) => (s, title),
                None => return Ok(()),
            }
        }
        None => return Ok(()),
    };

    info!("Today's LeetCode daily: {} ({})", daily_title.as_deref().unwrap_or("?"), daily_slug);

    // Step 2: Check user's recent submissions to see if they solved the daily
    let submissions_query = serde_json::json!({
        "query": "query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp } }",
        "variables": {
            "username": username,
            "limit": 20
        }
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&submissions_query)
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(());
    }

    let sub_data: LeetCodeResponse = resp.json().await?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    if let Some(data) = sub_data.data {
        if let Some(submissions) = data.recent_ac_submission_list {
            let solved_daily = submissions.iter().any(|s| {
                let slug_match = s.title_slug.as_deref() == Some(&daily_slug);
                let date_match = s.timestamp.as_ref().map_or(false, |ts| {
                    ts.parse::<i64>().ok().map_or(false, |t| {
                        chrono::DateTime::from_timestamp(t, 0)
                            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string() == today)
                            .unwrap_or(false)
                    })
                });
                slug_match && date_match
            });

            if solved_daily {
                let conn = db.lock().unwrap();
                let daily_habit_id: i64 = conn.query_row(
                    "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'daily'",
                    [],
                    |row| row.get(0),
                ).unwrap_or(5);

                let url = format!("https://leetcode.com/problems/{}/", daily_slug);
                let _ = queries::insert_completion(
                    &conn,
                    daily_habit_id,
                    &today,
                    "completed",
                    daily_title.as_deref(),
                    Some(&url),
                    "api_poll",
                    "desktop",
                );
                info!("LeetCode daily problem solved: {}", daily_slug);
            }
        }
    }

    Ok(())
}

/// Fetch historical submissions for backfill
pub async fn backfill_leetcode(db: &Arc<Mutex<Connection>>, months: i32) -> Result<i32, Box<dyn std::error::Error + Send + Sync>> {
    let username = {
        let conn = db.lock().unwrap();
        queries::get_setting(&conn, "leetcode_username")
    };

    let username = match username {
        Some(u) if !u.is_empty() => u,
        _ => return Ok(0),
    };

    let client = reqwest::Client::new();

    // For backfill, we request a larger limit
    let limit = match months {
        6 => 200,
        12 => 500,
        _ => 1000,
    };

    let query = serde_json::json!({
        "query": "query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { id title titleSlug timestamp } }",
        "variables": { "username": username, "limit": limit }
    });

    let resp = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&query)
        .send()
        .await?;

    let data: LeetCodeResponse = resp.json().await?;
    let mut count = 0;

    let cutoff = chrono::Local::now()
        .date_naive()
        .checked_sub_months(chrono::Months::new(months as u32))
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    if let Some(data) = data.data {
        if let Some(submissions) = data.recent_ac_submission_list {
            let conn = db.lock().unwrap();
            let habit_id: i64 = conn.query_row(
                "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'problem'",
                [],
                |row| row.get(0),
            )?;

            for sub in &submissions {
                if let Some(timestamp) = &sub.timestamp {
                    if let Ok(ts) = timestamp.parse::<i64>() {
                        let date = chrono::DateTime::from_timestamp(ts, 0)
                            .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
                            .unwrap_or_default();

                        if !date.is_empty() && date >= cutoff {
                            let title = sub.title.as_deref();
                            let url = sub.title_slug.as_ref().map(|s| format!("https://leetcode.com/problems/{}/", s));
                            let _ = queries::insert_completion(
                                &conn, habit_id, &date, "completed", title, url.as_deref(), "backfill", "desktop",
                            );
                            count += 1;
                        }
                    }
                }
            }
        }
    }

    // Also backfill contest history
    let contest_query = serde_json::json!({
        "query": "query userContestRankingInfo($username: String!) { userContestRanking(username: $username) { attendedContestsCount rating } userContestRankingHistory(username: $username) { attended contest { title startTime } ranking } }",
        "variables": { "username": username }
    });

    if let Ok(resp) = client
        .post("https://leetcode.com/graphql")
        .header("Content-Type", "application/json")
        .header("Referer", "https://leetcode.com")
        .json(&contest_query)
        .send()
        .await
    {
        if let Ok(cdata) = resp.json::<LeetCodeResponse>().await {
            if let Some(cdata) = cdata.data {
                if let Some(history) = cdata.user_contest_ranking_history {
                    let conn = db.lock().unwrap();
                    let contest_habit_id: i64 = conn.query_row(
                        "SELECT id FROM habits WHERE platform = 'leetcode' AND type = 'contest'",
                        [],
                        |row| row.get(0),
                    ).unwrap_or(2);

                    for entry in &history {
                        if entry.attended.unwrap_or(false) {
                            if let Some(contest) = &entry.contest {
                                if let Some(start_time) = contest.start_time {
                                    let date = chrono::DateTime::from_timestamp(start_time, 0)
                                        .map(|dt| dt.with_timezone(&chrono::Local).format("%Y-%m-%d").to_string())
                                        .unwrap_or_default();
                                    if !date.is_empty() && date >= cutoff {
                                        let title = contest.title.as_deref();
                                        let _ = queries::insert_completion(
                                            &conn, contest_habit_id, &date, "completed", title, None, "backfill", "desktop",
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(count)
}
