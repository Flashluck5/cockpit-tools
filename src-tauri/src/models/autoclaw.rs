use serde::{Deserialize, Serialize};

/// One model entry from ~/.openclaw-autoclaw/openclaw.json (models.providers.zai.models).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoclawModelInfo {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i64>,
}

/// Live snapshot of the local AutoClaw installation and its active account.
///
/// Account identity comes from the gateway JWT in `request-headers.json`
/// (plaintext, refreshed by the AutoClaw app itself). The app-level auth token
/// in `auth.json` (`enc:v10:...`) is intentionally NOT touched here.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoclawStatus {
    pub installed: bool,
    pub state_dir: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_guest: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_issued_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_expires_at: Option<i64>,
    pub token_valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub primary_model: Option<String>,
    #[serde(default)]
    pub models: Vec<AutoclawModelInfo>,
    /// Set when a sub-feature needs extra work (e.g. quota needs the app auth token).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota_note: Option<String>,
}
