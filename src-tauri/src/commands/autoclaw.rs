use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;

use crate::models::autoclaw::AutoclawStatus;
use crate::modules::autoclaw_account;

const BRIDGE_HEALTH_URL: &str = "http://127.0.0.1:8787/health";
const BRIDGE_START_TIMEOUT_MS: u64 = 1500;

#[tauri::command]
pub fn get_autoclaw_status() -> AutoclawStatus {
    autoclaw_account::collect_status()
}

fn bridge_script_path() -> PathBuf {
    if let Ok(value) = std::env::var("AUTOCLAW_BRIDGE_SCRIPT") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // Default layout produced by the AutoClaw bridge setup (kept on drive D:).
    let d_default = PathBuf::from("D:\\autoclawtoz.ai\\bridge\\bridge.mjs");
    if d_default.exists() {
        return d_default;
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("autoclawtoz.ai")
        .join("bridge")
        .join("bridge.mjs")
}

fn bridge_node_path() -> String {
    if let Ok(value) = std::env::var("AUTOCLAW_BRIDGE_NODE") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    // Prefer AutoClaw's bundled Node (always present when AutoClaw is installed),
    // fall back to PATH lookup by spawning "node" and letting the OS resolve it.
    for candidate in [
        "D:\\autoclaw\\resources\\node\\node.exe".to_string(),
        "C:\\Program Files\\AutoClaw\\resources\\node\\node.exe".to_string(),
    ] {
        if std::path::Path::new(&candidate).exists() {
            return candidate;
        }
    }
    "node".to_string()
}

async fn bridge_health() -> Result<Value, String> {
    let response = reqwest::Client::new()
        .get(BRIDGE_HEALTH_URL)
        .timeout(Duration::from_millis(BRIDGE_START_TIMEOUT_MS))
        .send()
        .await
        .map_err(|error| format!("мост недоступен: {}", error))?;
    if !response.status().is_success() {
        return Err(format!("мост вернул HTTP {}", response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|error| format!("не удалось разобрать /health: {}", error))
}

#[tauri::command]
pub async fn autoclaw_bridge_status() -> Result<Value, String> {
    bridge_health().await
}

/// Start the local AutoClaw→ZCode bridge if it is not already running.
/// Returns "already-running" or "started".
#[tauri::command]
pub async fn autoclaw_bridge_start() -> Result<String, String> {
    if bridge_health().await.is_ok() {
        return Ok("already-running".to_string());
    }
    let script = bridge_script_path();
    if !script.exists() {
        return Err(format!("скрипт моста не найден: {}", script.display()));
    }
    let mut command = std::process::Command::new(bridge_node_path());
    command.arg(&script);
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP: survive the launcher.
        command.creation_flags(0x0000_0008 | 0x0000_0200);
    }
    command
        .spawn()
        .map_err(|error| format!("не удалось запустить мост: {}", error))?;
    for _ in 0..12 {
        tokio::time::sleep(Duration::from_millis(300)).await;
        if bridge_health().await.is_ok() {
            return Ok("started".to_string());
        }
    }
    Err("мост запущен, но /health не отвечает".to_string())
}
