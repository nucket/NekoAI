//! AI provider calls, all made from Rust.
//!
//! The WebView never talks to a provider directly: it sends one `ai_chat`
//! request (registered in lib.rs) and gets back the reply text or a
//! structured [`AiError`]. That gives every provider the same transport (one
//! pooled `reqwest` client, one timeout), the same response parsing and the
//! same error classification, avoids CORS entirely, and lets the CSP's
//! `connect-src` stay limited to IPC.
//!
//! Building the HTTP request ([`build_request`]) and reading the response
//! ([`parse_reply`], [`classify_status`]) are pure functions so they can be
//! tested without a network.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

/// Mirror of `DEFAULT_MAX_TOKENS` in src/ai/types.ts — keep both in sync.
/// Used when a request carries no `maxTokens`.
pub const DEFAULT_MAX_TOKENS: u32 = 512;

/// Ceiling for one provider call. Long enough for a slow local model on CPU.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// The Ollama probe at first launch must not hold up onboarding.
const DETECT_TIMEOUT: Duration = Duration::from_millis(2500);

const DEFAULT_OLLAMA_URL: &str = "http://localhost:11434";

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    Openai,
    Gemini,
    Nvidia,
    Ollama,
}

impl Provider {
    fn label(self) -> &'static str {
        match self {
            Provider::Anthropic => "Anthropic",
            Provider::Openai => "OpenAI",
            Provider::Gemini => "Gemini",
            Provider::Nvidia => "NVIDIA NIM",
            Provider::Ollama => "Ollama",
        }
    }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

impl Role {
    fn as_str(self) -> &'static str {
        match self {
            Role::User => "user",
            Role::Assistant => "assistant",
        }
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

/// One chat turn as sent by the frontend (`invoke('ai_chat', { request })`).
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub provider: Provider,
    #[serde(default)]
    pub api_key: Option<String>,
    pub model: String,
    #[serde(default)]
    pub base_url: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub system_prompt: String,
    #[serde(default)]
    pub max_tokens: Option<u32>,
}

/// What went wrong, in terms the frontend can turn into a message.
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// Missing or rejected API key.
    Auth,
    /// 429 or an exhausted quota.
    RateLimit,
    /// The provider (or the Ollama daemon) could not be reached.
    Network,
    Timeout,
    /// The call succeeded but carried no text (token budget, safety block).
    Empty,
    /// The request itself is malformed (bad base URL or model name).
    InvalidRequest,
    Other,
}

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct AiError {
    pub kind: ErrorKind,
    pub message: String,
}

impl AiError {
    fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

/// A provider HTTP call, before it is sent. Carries no secret: the API key
/// is attached separately (see [`credential`]) so it can only ever go to an
/// `https://` endpoint.
#[derive(Debug)]
pub struct HttpRequest {
    pub url: String,
    pub headers: Vec<(&'static str, String)>,
    pub body: Value,
}

// ─── Shared HTTP client ──────────────────────────────────────────────────────

/// One `reqwest::Client` for every provider call, so connections and TLS
/// sessions are pooled instead of rebuilt per request. Timeouts are set per
/// request, since the Ollama probe and chat calls need different limits.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

// ─── Validation ──────────────────────────────────────────────────────────────

/// The Ollama base URL from Settings, or the local default. Only `http` and
/// `https` URLs are accepted; the trailing slash is dropped so paths join
/// cleanly.
pub fn ollama_base_url(base_url: Option<&str>) -> Result<String, AiError> {
    let raw = base_url
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_OLLAMA_URL);
    let url = reqwest::Url::parse(raw)
        .map_err(|_| AiError::new(ErrorKind::InvalidRequest, "Invalid Ollama URL"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(AiError::new(
            ErrorKind::InvalidRequest,
            "The Ollama URL must start with http:// or https://",
        ));
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// Model names end up in a URL path for Gemini, so only allow the characters
/// real model ids use (`gemini-2.5-flash`, `meta/llama-3.1-8b-instruct`,
/// `llama3:8b`).
fn validate_model(model: &str) -> Result<&str, AiError> {
    let model = model.trim();
    let ok = !model.is_empty()
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':' | '/'));
    if ok {
        Ok(model)
    } else {
        Err(AiError::new(
            ErrorKind::InvalidRequest,
            format!("Invalid model name: {model:?}"),
        ))
    }
}

fn api_key(req: &ChatRequest) -> Result<&str, AiError> {
    req.api_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .ok_or_else(|| {
            AiError::new(
                ErrorKind::Auth,
                format!("No API key configured for {}", req.provider.label()),
            )
        })
}

/// The auth header for `req`'s provider, or `None` for Ollama (no key).
/// Gemini takes its key in `x-goog-api-key`, not the `?key=` query string,
/// so it never lands in URLs, logs or error messages.
pub fn credential(req: &ChatRequest) -> Result<Option<(&'static str, String)>, AiError> {
    Ok(match req.provider {
        Provider::Anthropic => Some(("x-api-key", api_key(req)?.to_string())),
        Provider::Openai | Provider::Nvidia => {
            Some(("authorization", format!("Bearer {}", api_key(req)?)))
        }
        Provider::Gemini => Some(("x-goog-api-key", api_key(req)?.to_string())),
        Provider::Ollama => None,
    })
}

// ─── Request building ────────────────────────────────────────────────────────

/// Chat messages in the OpenAI-style `[{role, content}]` shape, with the
/// system prompt first (OpenAI, NVIDIA NIM, Ollama).
fn openai_style_messages(req: &ChatRequest) -> Vec<Value> {
    let mut out = vec![json!({ "role": "system", "content": req.system_prompt })];
    out.extend(
        req.messages
            .iter()
            .map(|m| json!({ "role": m.role.as_str(), "content": m.content })),
    );
    out
}

pub fn build_request(req: &ChatRequest) -> Result<HttpRequest, AiError> {
    let model = validate_model(&req.model)?;
    let max_tokens = req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
    let json_ct = ("content-type", "application/json".to_string());

    let request = match req.provider {
        Provider::Anthropic => HttpRequest {
            url: "https://api.anthropic.com/v1/messages".into(),
            headers: vec![json_ct, ("anthropic-version", "2023-06-01".into())],
            body: json!({
                "model": model,
                "max_tokens": max_tokens,
                "system": req.system_prompt,
                "messages": req.messages.iter()
                    .map(|m| json!({ "role": m.role.as_str(), "content": m.content }))
                    .collect::<Vec<_>>(),
            }),
        },
        Provider::Openai => HttpRequest {
            url: "https://api.openai.com/v1/chat/completions".into(),
            headers: vec![json_ct],
            // `max_tokens` is rejected (HTTP 400) by the o-series / gpt-5
            // reasoning models; `max_completion_tokens` works on all current
            // chat models.
            body: json!({
                "model": model,
                "max_completion_tokens": max_tokens,
                "messages": openai_style_messages(req),
            }),
        },
        Provider::Gemini => {
            let mut generation = json!({ "maxOutputTokens": max_tokens });
            // Gemini 2.5 Flash / Flash-Lite "think" first, and thinking
            // tokens count against maxOutputTokens, so short budgets can be
            // spent entirely on thinking. 2.5 Pro rejects a 0 budget, so only
            // Flash gets it.
            if model.contains("gemini-2.5-flash") {
                generation["thinkingConfig"] = json!({ "thinkingBudget": 0 });
            }
            HttpRequest {
                url: format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
                ),
                headers: vec![json_ct],
                body: json!({
                    "system_instruction": { "parts": [{ "text": req.system_prompt }] },
                    "contents": req.messages.iter().map(|m| json!({
                        // Gemini says "model" where other APIs say "assistant".
                        "role": if m.role == Role::Assistant { "model" } else { "user" },
                        "parts": [{ "text": m.content }],
                    })).collect::<Vec<_>>(),
                    "generationConfig": generation,
                }),
            }
        }
        Provider::Nvidia => HttpRequest {
            url: "https://integrate.api.nvidia.com/v1/chat/completions".into(),
            headers: vec![json_ct],
            body: json!({
                "model": model,
                "max_tokens": max_tokens,
                "messages": openai_style_messages(req),
            }),
        },
        Provider::Ollama => HttpRequest {
            url: format!("{}/api/chat", ollama_base_url(req.base_url.as_deref())?),
            headers: vec![json_ct],
            body: json!({
                "model": model,
                "stream": false,
                "options": { "num_predict": max_tokens },
                "messages": openai_style_messages(req),
            }),
        },
    };
    Ok(request)
}

// ─── Response parsing ────────────────────────────────────────────────────────

fn empty(provider: Provider, reason: Option<&str>) -> AiError {
    let message = match reason {
        Some(r) if !r.is_empty() => {
            format!("{} returned an empty response ({r})", provider.label())
        }
        _ => format!("{} returned an empty response", provider.label()),
    };
    AiError::new(ErrorKind::Empty, message)
}

/// Extracts the reply text from a successful (2xx) response body.
pub fn parse_reply(provider: Provider, data: &Value) -> Result<String, AiError> {
    let (text, reason) = match provider {
        Provider::Anthropic => {
            let text = data["content"]
                .as_array()
                .map(|blocks| {
                    blocks
                        .iter()
                        .filter(|b| b["type"] == "text")
                        .filter_map(|b| b["text"].as_str())
                        .collect::<String>()
                })
                .unwrap_or_default();
            (text, data["stop_reason"].as_str())
        }
        Provider::Openai | Provider::Nvidia => {
            let choice = &data["choices"][0];
            // A refusal is still a user-facing answer — show it.
            let text = choice["message"]["content"]
                .as_str()
                .or_else(|| choice["message"]["refusal"].as_str())
                .unwrap_or_default()
                .to_string();
            (text, choice["finish_reason"].as_str())
        }
        Provider::Gemini => {
            let candidate = &data["candidates"][0];
            let text = candidate["content"]["parts"]
                .as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter(|p| p["thought"] != true)
                        .filter_map(|p| p["text"].as_str())
                        .collect::<String>()
                })
                .unwrap_or_default();
            let reason = data["promptFeedback"]["blockReason"]
                .as_str()
                .or_else(|| candidate["finishReason"].as_str());
            (text, reason)
        }
        Provider::Ollama => {
            let text = data["message"]["content"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            (text, data["done_reason"].as_str())
        }
    };

    let text = text.trim();
    if text.is_empty() {
        Err(empty(provider, reason))
    } else {
        Ok(text.to_string())
    }
}

/// Classifies a non-2xx response. `body` is the response text, used for
/// providers that signal a bad key or quota with a generic status.
pub fn classify_status(provider: Provider, status: u16, body: &str) -> AiError {
    let lower = body.to_ascii_lowercase();
    let bad_key = lower.contains("api_key_invalid")
        || lower.contains("api key not valid")
        || lower.contains("invalid api key")
        || lower.contains("invalid_api_key");
    let quota = lower.contains("resource_exhausted")
        || lower.contains("quota")
        || lower.contains("rate limit");

    let kind = match status {
        401 | 403 => ErrorKind::Auth,
        429 => ErrorKind::RateLimit,
        _ if bad_key => ErrorKind::Auth,
        _ if quota => ErrorKind::RateLimit,
        _ => ErrorKind::Other,
    };

    // Keep enough of the body to debug, but never all of it.
    let excerpt: String = body.trim().chars().take(300).collect();
    let message = if excerpt.is_empty() {
        format!("{} API error: {status}", provider.label())
    } else {
        format!("{} API error: {status} — {excerpt}", provider.label())
    };
    AiError::new(kind, message)
}

fn transport_error(provider: Provider, e: &reqwest::Error) -> AiError {
    if e.is_timeout() {
        AiError::new(
            ErrorKind::Timeout,
            format!("{} request timed out", provider.label()),
        )
    } else if e.is_connect() || e.is_request() {
        AiError::new(
            ErrorKind::Network,
            format!("{} request failed: {e}", provider.label()),
        )
    } else {
        AiError::new(ErrorKind::Other, format!("{}: {e}", provider.label()))
    }
}

// ─── Sending ─────────────────────────────────────────────────────────────────

pub async fn chat(req: ChatRequest) -> Result<String, AiError> {
    let provider = req.provider;
    let http = build_request(&req)?;
    let auth = credential(&req)?;

    let mut builder = http_client()
        .post(&http.url)
        .timeout(REQUEST_TIMEOUT)
        .json(&http.body);
    for (name, value) in &http.headers {
        builder = builder.header(*name, value);
    }
    if let Some((name, value)) = auth {
        // Every keyed provider has a fixed https endpoint; refuse anything
        // else rather than send a key in clear text.
        if !http.url.starts_with("https://") {
            return Err(AiError::new(
                ErrorKind::InvalidRequest,
                format!("{} requires an https endpoint", provider.label()),
            ));
        }
        builder = builder.header(name, value);
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| transport_error(provider, &e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(classify_status(provider, status.as_u16(), &body));
    }

    let data: Value = resp.json().await.map_err(|e| {
        AiError::new(
            ErrorKind::Other,
            format!("{} sent an unreadable response: {e}", provider.label()),
        )
    })?;
    parse_reply(provider, &data)
}

/// Lists the models of an Ollama daemon (`GET /api/tags`). Used by first-run
/// onboarding to auto-configure a local install.
pub async fn ollama_models(base_url: Option<&str>) -> Result<Vec<String>, AiError> {
    let url = format!("{}/api/tags", ollama_base_url(base_url)?);
    let resp = http_client()
        .get(&url)
        .timeout(DETECT_TIMEOUT)
        .send()
        .await
        .map_err(|e| transport_error(Provider::Ollama, &e))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(classify_status(Provider::Ollama, status.as_u16(), &body));
    }
    let data: Value = resp.json().await.map_err(|e| {
        AiError::new(
            ErrorKind::Other,
            format!("Ollama sent an unreadable response: {e}"),
        )
    })?;
    Ok(data["models"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter_map(|m| m["name"].as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(provider: Provider, model: &str) -> ChatRequest {
        ChatRequest {
            provider,
            api_key: Some("sk-test".into()),
            model: model.into(),
            base_url: None,
            messages: vec![
                ChatMessage {
                    role: Role::User,
                    content: "hi".into(),
                },
                ChatMessage {
                    role: Role::Assistant,
                    content: "hello".into(),
                },
            ],
            system_prompt: "be a cat".into(),
            max_tokens: Some(256),
        }
    }

    fn header<'a>(req: &'a HttpRequest, name: &str) -> Option<&'a str> {
        req.headers
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.as_str())
    }

    fn auth(provider: Provider) -> Option<(&'static str, String)> {
        credential(&request(provider, "m")).unwrap()
    }

    #[test]
    fn each_provider_authenticates_with_its_own_header() {
        assert_eq!(
            auth(Provider::Anthropic),
            Some(("x-api-key", "sk-test".into()))
        );
        assert_eq!(
            auth(Provider::Openai),
            Some(("authorization", "Bearer sk-test".into()))
        );
        assert_eq!(
            auth(Provider::Nvidia),
            Some(("authorization", "Bearer sk-test".into()))
        );
        assert_eq!(
            auth(Provider::Gemini),
            Some(("x-goog-api-key", "sk-test".into()))
        );
        assert_eq!(auth(Provider::Ollama), None);
        // Keyed providers all target https; the key never sits in the request.
        for p in [
            Provider::Anthropic,
            Provider::Openai,
            Provider::Nvidia,
            Provider::Gemini,
        ] {
            let http = build_request(&request(p, "m")).unwrap();
            assert!(http.url.starts_with("https://"));
            assert!(!format!("{http:?}").contains("sk-test"));
        }
    }

    #[test]
    fn gemini_sends_the_key_in_a_header_and_disables_flash_thinking() {
        let http = build_request(&request(Provider::Gemini, "gemini-2.5-flash")).unwrap();
        assert!(!http.url.contains("key="));
        assert!(http
            .url
            .ends_with("/models/gemini-2.5-flash:generateContent"));
        let thinking = &http.body["generationConfig"]["thinkingConfig"];
        assert_eq!(thinking["thinkingBudget"], 0);
        assert_eq!(http.body["contents"][1]["role"], "model");
        assert_eq!(
            http.body["system_instruction"]["parts"][0]["text"],
            "be a cat"
        );

        let pro = build_request(&request(Provider::Gemini, "gemini-2.5-pro")).unwrap();
        assert!(pro.body["generationConfig"].get("thinkingConfig").is_none());
    }

    #[test]
    fn openai_style_providers_put_the_system_prompt_first() {
        let http = build_request(&request(Provider::Openai, "gpt-4o-mini")).unwrap();
        assert_eq!(http.body["max_completion_tokens"], 256);
        assert_eq!(http.body["messages"][0]["role"], "system");
        assert_eq!(http.body["messages"][2]["role"], "assistant");

        let nim = build_request(&request(Provider::Nvidia, "meta/llama-3.1-8b-instruct")).unwrap();
        assert_eq!(nim.body["max_tokens"], 256);
    }

    #[test]
    fn anthropic_uses_its_own_headers_and_system_field() {
        let http = build_request(&request(Provider::Anthropic, "claude-haiku-4-5")).unwrap();
        assert_eq!(header(&http, "anthropic-version"), Some("2023-06-01"));
        assert_eq!(http.body["system"], "be a cat");
        assert_eq!(http.body["messages"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn cloud_providers_need_a_key_and_models_are_validated() {
        let mut req = request(Provider::Openai, "gpt-4o-mini");
        req.api_key = Some("  ".into());
        assert_eq!(credential(&req).unwrap_err().kind, ErrorKind::Auth);

        let bad = request(Provider::Gemini, "x?key=steal#");
        assert_eq!(
            build_request(&bad).unwrap_err().kind,
            ErrorKind::InvalidRequest
        );
    }

    #[test]
    fn ollama_urls_must_be_http() {
        assert_eq!(ollama_base_url(None).unwrap(), "http://localhost:11434");
        assert_eq!(
            ollama_base_url(Some("http://192.168.1.5:11434/")).unwrap(),
            "http://192.168.1.5:11434"
        );
        for bad in ["file:///etc/passwd", "ftp://host", "not a url", "http://"] {
            assert_eq!(
                ollama_base_url(Some(bad)).unwrap_err().kind,
                ErrorKind::InvalidRequest,
                "{bad}"
            );
        }
        let mut req = request(Provider::Ollama, "llama3:8b");
        req.api_key = None;
        let http = build_request(&req).unwrap();
        assert_eq!(http.url, "http://localhost:11434/api/chat");
        assert_eq!(http.body["options"]["num_predict"], 256);
    }

    #[test]
    fn replies_are_parsed_per_provider() {
        let anthropic = json!({ "content": [
            { "type": "text", "text": "Hi " }, { "type": "tool_use" }, { "type": "text", "text": "there" }
        ]});
        assert_eq!(
            parse_reply(Provider::Anthropic, &anthropic).unwrap(),
            "Hi there"
        );

        let refusal = json!({ "choices": [{ "message": { "content": null, "refusal": "No." } }] });
        assert_eq!(parse_reply(Provider::Openai, &refusal).unwrap(), "No.");

        let gemini = json!({ "candidates": [{ "content": { "parts": [
            { "text": "thinking…", "thought": true }, { "text": "Meow" }
        ]}}]});
        assert_eq!(parse_reply(Provider::Gemini, &gemini).unwrap(), "Meow");

        let ollama = json!({ "message": { "content": "  purr \n" } });
        assert_eq!(parse_reply(Provider::Ollama, &ollama).unwrap(), "purr");
    }

    #[test]
    fn empty_replies_carry_the_reason() {
        let blocked = json!({ "promptFeedback": { "blockReason": "SAFETY" }, "candidates": [] });
        let err = parse_reply(Provider::Gemini, &blocked).unwrap_err();
        assert_eq!(err.kind, ErrorKind::Empty);
        assert!(err.message.contains("SAFETY"));

        let cut =
            json!({ "choices": [{ "message": { "content": "" }, "finish_reason": "length" }] });
        assert!(parse_reply(Provider::Nvidia, &cut)
            .unwrap_err()
            .message
            .contains("length"));
    }

    #[test]
    fn statuses_are_classified() {
        let kind = |p, s, b| classify_status(p, s, b).kind;
        assert_eq!(kind(Provider::Openai, 401, ""), ErrorKind::Auth);
        assert_eq!(kind(Provider::Anthropic, 429, ""), ErrorKind::RateLimit);
        assert_eq!(
            kind(
                Provider::Gemini,
                400,
                r#"{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}"#
            ),
            ErrorKind::Auth
        );
        assert_eq!(
            kind(Provider::Gemini, 400, "Invalid JSON payload"),
            ErrorKind::Other
        );
        assert_eq!(
            kind(Provider::Gemini, 403, "RESOURCE_EXHAUSTED"),
            ErrorKind::Auth
        );
        assert_eq!(kind(Provider::Nvidia, 500, ""), ErrorKind::Other);

        let long = "x".repeat(1000);
        let err = classify_status(Provider::Openai, 500, &long);
        assert!(err.message.len() < 400);
    }
}
