# AutoClaw integration (skeleton) — findings & roadmap

Status: **Phase 1 implemented** (local account/status readout), **Phase 2 scoped** (quota, daily check-in).

## What AutoClaw is (local architecture)

- Electron app, install dir `%LOCALAPPDATA%`-style; user data in `AppData/Roaming/AutoClaw`.
- Agent core: bundled OpenClaw gateway, state dir `~/.openclaw-autoclaw/`.
- Model provider: single `zai` provider → OpenAI-compatible proxy
  `https://autoglm-api.autoglm.ai/autoclaw-proxy/proxy/autoclaw/chat/completions`,
  auth = gateway JWT (plaintext, refreshed by the app, TTL 24h) in
  `~/.openclaw-autoclaw/request-headers.json` → `headers.X-Authorization`.
- Bonus/tasks API: `.../autoclaw-task-list`, `.../autoclaw-task-complete`
  (daily check-in = `daily_signin` task).

## Phase 1 — implemented in this skeleton

- `src-tauri/src/modules/autoclaw_account.rs` — state dir detection
  (`OPENCLAW_STATE_DIR` or `~/.openclaw-autoclaw`), JWT payload decode
  (email=jti, user_id, device_id, is_guest, iat/exp → token validity),
  model list + app version + primary model from `openclaw.json`.
- `src-tauri/src/models/autoclaw.rs`, `src-tauri/src/commands/autoclaw.rs`
  (`get_autoclaw_status`), registered in `lib.rs`.
- Reference implementation / live test: `tools/autoclaw-proto.mjs` (in the fork workspace).

No credentials are decrypted here: the gateway JWT is plaintext by design (the app
refreshes it for the gateway subprocess).

## Phase 2 — quota + daily check-in (NOT implemented, verified blockers)

Verified by probing:

| Attempt | Result |
|---|---|
| `GET zcode.z.ai/api/v1/zcode-plan/billing/balance` with gateway JWT | **401** (different audience) |
| `GET autoglm-api.../autoclaw-task-list?lang=ru` with gateway JWT | **401 Invalid token** |

Both the "Today's balance" panel and check-in run on the **app auth token** stored
encrypted at `AppData/Roaming/AutoClaw/auth.json` (`"token": "enc:djEw..."`, scheme
`v10`, single blob — not the 3-part AES-GCM `enc:v1` that ZCode uses and that
`zcode_account::decrypt_credential` already handles).

Phase 2 options, cheapest first:

1. **Gateway RPC**: check whether the running app exposes check-in/quota over
   `ws://127.0.0.1:18789` (OpenClaw gateway protocol) or the loopback token server
   (AutoClaw listens on 127.0.0.1:18432/19654/19723/53699) — no crypto needed.
2. **enc:v10 scheme RE**: locate key derivation in the app bundle
   (`out/main/index.js` → AuthAPI), reproduce decrypt in Rust, reuse
   `zcode.z.ai`-style APIs with the app token.
3. **Wake-up fallback without any API**: scheduled app launch once per day —
   the app performs the check-in itself while running.

## Frontend wiring (when Phase 1 lands)

- Follow the ZCode page pattern (`src/pages` + `src/services`), add
  `autoclaw` platform card; `AutoclawStatus` maps 1:1 to a card:
  email, token validity badge (expiring in N hours → "open AutoClaw to refresh"),
  model list with context/output limits, primary model.
- i18n: 18 locales in `src/locales` — add keys for the new card.
