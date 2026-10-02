//! Development-only contract oracle. No production command or runtime selector.
use serde_json::Value;
use std::io::{self, BufRead};
use tdev::contract::Contract;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let contract = Contract::embedded()?;
    for line in io::stdin().lock().lines() {
        let case: Value = serde_json::from_str(&line?)?;
        let valid = match case["surface"].as_str() {
            Some("input") => contract
                .input(case["tool"].as_str().ok_or("Missing tool")?, &case["value"])
                .is_ok(),
            Some("output") => contract
                .output(case["tool"].as_str().ok_or("Missing tool")?, &case["value"])
                .is_ok(),
            Some("config") => contract.config(&case["value"]).is_ok(),
            _ => return Err("Unknown contract surface".into()),
        };
        println!("{valid}");
    }
    Ok(())
}
