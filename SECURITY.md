# Security Notes (Frontend Prototype + Production Requirements)

This repo currently contains a frontend prototype. It does **not** provide real authentication, moderation, or secure signaling by itself.

## Security improvements already applied in this prototype

- Removed password-based login UI and replaced with email verification code flow (safer UX pattern for a demo).
- Client-side allowlist for UMN email domains via `src/config/allowedEmailDomains.json`.
- Input validation and length limits on email, code, profile fields, and chat messages.
- No `dangerouslySetInnerHTML` usage (React escapes text content by default).
- No localStorage/sessionStorage token persistence in the client demo.

## Production security requirements (must-have)

- UMN SSO or verified email OTP on the **server** (client checks are not security).
- HttpOnly + Secure + SameSite cookies for session auth (avoid localStorage JWTs).
- CSRF protection for state-changing HTTP endpoints if using cookies.
- Rate limiting for OTP send/verify, matchmaking, chat send, report/block actions.
- WebSocket authentication + origin checks before joining signaling channels.
- TURN credentials generated short-lived on the server (never hardcode in frontend).
- Message/content moderation pipeline and abuse reporting with audit logs.
- Server-side validation for all profile/chat inputs (length, character class, schema).
- IP/device throttling and anti-spam heuristics.
- Encryption in transit (HTTPS/WSS only) and secrets via environment variables.
- Secure file storage strategy if images are added later (scanning + signed URLs).
- Logging/redaction policy (no OTPs, no full email bodies, no tokens in logs).

## Known limitations in this repo

- OTP is simulated in the browser (`123456`) for demo purposes.
- Video tiles are mock UI only; no WebRTC/signaling server exists yet.
- No backend moderation, reporting, or persistence implemented yet.
