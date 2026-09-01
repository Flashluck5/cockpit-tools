use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde_json::Value;
use std::path::PathBuf;

use crate::models::autoclaw::{AutoclawModelInfo, AutoclawStatus};

const STATE_DIR_NAME: &str = ".openclaw-autoclaw";
const REQUEST_HEADERS_FILE: &str = "request-headers.json";
const CONFIG_FILE: &str = "openclaw.json";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

/// AutoClaw state dir: `$OPENCLAW_STATE_DIR` override, otherwise `~/.openclaw-autoclaw`.
pub fn state_dir() -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("OPENCLAW_STATE_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    let home = dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?;
    Ok(home.join(STATE_DIR_NAME))
}

fn read_json_file(path: &PathBuf) -> Result<Value, String> {
    let content = fs_err(path)?;
    serde_json::from_str::<Value>(&content).map_err(|error| format!("JSON 解析失败 ({}): {}", path.display(), error))
}

fn fs_err(path: &PathBuf) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("读取 {} 失败: {}", path.display(), error))
}

/// Extract the gateway JWT from request-headers.json (X-Authorization: "Bearer eyJ...").
fn read_gateway_jwt(state: &PathBuf) -> Result<String, String> {
    let payload = read_json_file(&state.join(REQUEST_HEADERS_FILE))?;
    let raw = payload
        .pointer("/headers/X-Authorization")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{} 缺少 headers.X-Authorization", REQUEST_HEADERS_FILE))?;
    Ok(raw.trim().trim_start_matches("Bearer ").trim().to_string())
}

/// Decode a JWT payload segment (no signature verification — identity/expiry info only).
fn decode_jwt_payload(jwt: &str) -> Result<Value, String> {
    let segment = jwt.split('.').nth(1).ok_or_else(|| "JWT 格式无效".to_string())?;
    let decoded = URL_SAFE_NO_PAD
        .decode(segment.trim_end_matches('='))
        .map_err(|error| format!("JWT payload 解码失败: {}", error))?;
    serde_json::from_slice::<Value>(&decoded).map_err(|error| format!("JWT payload 解析失败: {}", error))
}

fn jwt_i64(payload: &Value, field: &str) -> Option<i64> {
    payload.get(field).and_then(Value::as_i64)
}

fn parse_models(config: &Value) -> Vec<AutoclawModelInfo> {
    config
        .pointer("/models/providers/zai/models")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let id = entry.get("id").and_then(Value::as_str)?.to_string();
                    Some(AutoclawModelInfo {
                        name: entry
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or(&id)
                            .to_string(),
                        context_window: entry.get("contextWindow").and_then(Value::as_i64),
                        max_tokens: entry.get("maxTokens").and_then(Value::as_i64),
                        id,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_app_version(config: &Value) -> Option<String> {
    config
        .pointer("/models/providers/zai/models/0/headers/X-Version")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parse_primary_model(config: &Value) -> Option<String> {
    config
        .pointer("/agents/defaults/model/primary")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Build the full local status snapshot. Never fails hard for a missing install:
/// returns `installed: false` so the UI can render an empty state.
pub fn collect_status() -> AutoclawStatus {
    let mut status = AutoclawStatus {
        installed: false,
        state_dir: String::new(),
        email: None,
        user_id: None,
        device_id: None,
        is_guest: None,
        token_issued_at: None,
        token_expires_at: None,
        token_valid: false,
        app_version: None,
        primary_model: None,
        models: Vec::new(),
        quota_note: Some(
            "Квоты/бонусы требуют auth-токен приложения (auth.json, enc:v10) — фаза 2".to_string(),
        ),
    };
    let state = match state_dir() {
        Ok(value) => value,
        Err(_) => return status,
    };
    status.state_dir = state.display().to_string();
    if !state.exists() {
        return status;
    }
    status.installed = true;

    let config = read_json_file(&state.join(CONFIG_FILE)).ok();
    if let Some(ref config) = config {
        status.models = parse_models(config);
        status.app_version = parse_app_version(config);
        status.primary_model = parse_primary_model(config);
    }

    // Token identity: JWT is plaintext and app-refreshed; missing file == app never ran.
    if let Ok(jwt) = read_gateway_jwt(&state) {
        if let Ok(payload) = decode_jwt_payload(&jwt) {
            status.email = payload
                .get("jti")
                .and_then(Value::as_str)
                .map(str::to_string);
            status.user_id = jwt_i64(&payload, "user_id");
            status.device_id = payload
                .get("device_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            status.is_guest = payload.get("is_guest").and_then(Value::as_bool);
            status.token_issued_at = jwt_i64(&payload, "iat");
            status.token_expires_at = jwt_i64(&payload, "exp");
            if let Some(exp) = status.token_expires_at {
                status.token_valid = exp * 1000 > now_ms();
            }
        }
    }
    status
}

/// Daily check-in / bonus endpoints live behind the app auth token (auth.json,
/// `enc:v10` scheme) and return 401 for the gateway JWT — see
/// docs/autoclaw-integration.md "Phase 2" before implementing wake-up here.
#[allow(dead_code)]
fn checkin_phase2_note() {}
