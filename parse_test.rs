use serde::Deserialize;
use std::fs;

#[derive(Debug, Deserialize)]
struct HeatmapEntry {
    date: Option<String>,
    value: Option<i64>,
}

fn main() {
    let html = fs::read_to_string("cc_profile.html").unwrap();
    if let Some(start_idx) = html.find("var userDailySubmissionsStats = [") {
        let rest = &html[start_idx + 32..];
        if let Some(end_idx) = rest.find("];") {
            let json_str = format!("[{}]", &rest[..end_idx]);
            match serde_json::from_str::<Vec<HeatmapEntry>>(&json_str) {
                Ok(entries) => {
                    println!("Parsed {} entries", entries.len());
                    for (i, entry) in entries.iter().take(5).enumerate() {
                        println!("Entry {}: {:?}", i, entry);
                    }
                }
                Err(e) => println!("Parse error: {}", e),
            }
        } else {
            println!("Could not find ];");
        }
    } else {
        println!("Could not find start string");
    }
}
